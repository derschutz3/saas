'use client'

/**
 * Hook de fetch otimizado com:
 * - Deduplicação automática de requests em flight
 * - Cache compartilhado entre componentes (SWR pattern)
 * - Stale-while-revalidate
 * - AbortController para cancelar requests em unmount
 * - Subscription eficiente (sem polling)
 * - Retry exponencial
 *
 * API compatível com SWR mas zero dependencies.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

type CacheEntry<T> = {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  // timestamp da última fetch bem-sucedida
  timestamp: number
  // inflight promise para dedup
  inflight?: Promise<T>
  // AbortController da requisição em curso (para cancelar no unmount)
  abortCtrl?: AbortController
  // subscribers version (bump para notificar mudanças)
  version: number
}

const cache = new Map<string, CacheEntry<unknown>>()

// TTL padrão: 30s
const DEFAULT_TTL = 30_000

// Limite de tamanho do cache (LRU simples)
const MAX_CACHE_SIZE = 100

function evictOldest() {
  if (cache.size <= MAX_CACHE_SIZE) return
  // Ordena por timestamp ASC e remove o mais antigo
  const entries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
  const toRemove = entries.slice(0, Math.max(1, entries.length - MAX_CACHE_SIZE))
  for (const [k] of toRemove) cache.delete(k)
}

function getEntry<T>(key: string): CacheEntry<T> {
  let entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) {
    entry = {
      data: undefined,
      error: undefined,
      isLoading: false,
      timestamp: 0,
      version: 0,
    }
    cache.set(key, entry as CacheEntry<unknown>)
    evictOldest()
  }
  return entry
}

function notifySubscribers(key: string) {
  const entry = cache.get(key)
  if (entry) entry.version++
}

type FetcherOptions = {
  ttl?: number
  revalidateOnFocus?: boolean
  revalidateOnReconnect?: boolean
  dedupingInterval?: number
  retries?: number
  retryDelay?: (attempt: number) => number
}

type InternalFetcherOptions = Required<FetcherOptions> & { signal?: AbortSignal }

async function fetcher<T>(
  key: string,
  fetchFn: (signal: AbortSignal) => Promise<T>,
  opts: InternalFetcherOptions,
  force = false,
): Promise<T> {
  const entry = getEntry<T>(key)

  // Retorna inflight se existir e estiver dentro do deduping interval (a menos que force)
  if (!force && entry.inflight) {
    const age = Date.now() - entry.timestamp
    if (age < opts.dedupingInterval) {
      return entry.inflight
    }
  }

  // Stale-while-revalidate: retorna cache e revalida em background (a menos que force)
  const isStale = Date.now() - entry.timestamp > opts.ttl

  if (!force && isStale && entry.data !== undefined) {
    // Revalida em background, mas retorna dado antigo imediatamente
    revalidateInBackground(key, fetchFn, opts)
    return entry.data
  }

  const promise = (async () => {
    entry.isLoading = true
    notifySubscribers(key)

    let lastError: Error | undefined
    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      // Cria AbortController novo para esta tentativa
      const ac = new AbortController()
      entry.abortCtrl = ac
      try {
        const data = await fetchFn(ac.signal)
        if (ac.signal.aborted) return entry.data as T // ignora resultado de request abortado
        entry.data = data
        entry.error = undefined
        entry.timestamp = Date.now()
        entry.isLoading = false
        entry.inflight = undefined
        entry.abortCtrl = undefined
        notifySubscribers(key)
        return data
      } catch (err) {
        // Erro de abort é silencioso — não conta como retry
        if (err instanceof DOMException && err.name === 'AbortError') {
          entry.isLoading = false
          entry.inflight = undefined
          entry.abortCtrl = undefined
          throw err
        }
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < opts.retries) {
          await new Promise((r) => setTimeout(r, opts.retryDelay(attempt)))
        }
      }
    }

    entry.error = lastError
    entry.isLoading = false
    entry.inflight = undefined
    entry.abortCtrl = undefined
    notifySubscribers(key)
    throw lastError
  })()

  entry.inflight = promise
  return promise
}

function revalidateInBackground<T>(
  key: string,
  fetchFn: (signal: AbortSignal) => Promise<T>,
  opts: InternalFetcherOptions,
) {
  // Dispara sem bloquear
  fetcher(key, fetchFn, opts).catch(() => {
    // erros tratados via entry.error (AbortError também é silencioso)
  })
}

// ===== SUBSCRIBE PATTERN =====
// Cada entry tem seu próprio set de subscribers.
// Notificamos direto via `notify(key, cb)` quando bumpamos a versão.

const subscribers = new Map<string, Set<() => void>>()

function subscribe(key: string, callback: () => void): () => void {
  let set = subscribers.get(key)
  if (!set) {
    set = new Set()
    subscribers.set(key, set)
  }
  set.add(callback)
  return () => {
    set!.delete(callback)
    if (set!.size === 0) subscribers.delete(key)
  }
}

type UseFetchResult<T> = {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isValidating: boolean
  mutate: () => Promise<T | undefined>
}

export function useFetch<T>(
  key: string | null,
  fetchFn: (signal: AbortSignal) => Promise<T>,
  options: FetcherOptions = {},
): UseFetchResult<T> {
  const opts: Required<FetcherOptions> = useMemo(
    () => ({
      ttl: options.ttl ?? DEFAULT_TTL,
      revalidateOnFocus: options.revalidateOnFocus ?? false,
      revalidateOnReconnect: options.revalidateOnReconnect ?? true,
      dedupingInterval: options.dedupingInterval ?? 2000,
      retries: options.retries ?? 2,
      retryDelay: options.retryDelay ?? ((attempt) => Math.min(1000 * 2 ** attempt, 5000)),
    }),
    [
      options.ttl,
      options.revalidateOnFocus,
      options.revalidateOnReconnect,
      options.dedupingInterval,
      options.retries,
      options.retryDelay,
    ],
  )

  const fetchFnRef = useRef(fetchFn)
  fetchFnRef.current = fetchFn

  // Snapshot do cache entry (cacheado por versão para evitar loop infinito do useSyncExternalStore)
  const snapshotRef = useRef<{
    data: T | undefined
    error: Error | undefined
    isLoading: boolean
    timestamp: number
    version: number
  } | null>(null)
  const lastKeyRef = useRef<string | null>(null)
  const getSnapshot = useCallback(() => {
    if (!key) return { data: undefined, error: undefined, isLoading: false, timestamp: 0, version: 0 }
    // Reset ref quando key muda
    if (lastKeyRef.current !== key) {
      snapshotRef.current = null
      lastKeyRef.current = key
    }
    const e = getEntry<T>(key)
    const cur = snapshotRef.current
    // Retorna a mesma referência enquanto a versão não muda
    if (cur && cur.version === e.version) return cur
    const next = {
      data: e.data,
      error: e.error,
      isLoading: e.isLoading,
      timestamp: e.timestamp,
      version: e.version,
    }
    snapshotRef.current = next
    return next
  }, [key])

  const entry = useSyncExternalStore(
    (cb) => {
      if (!key) return () => {}
      return subscribe(key, cb)
    },
    getSnapshot,
    getSnapshot,
  )

  // Trigger fetch inicial (ou quando key muda)
  useEffect(() => {
    if (!key) return
    const e = getEntry<T>(key)
    const needsFetch = e.data === undefined && !e.inflight
    if (needsFetch) {
      const ac = new AbortController()
      fetcher(
        key,
        (signal) => fetchFnRef.current(signal),
        { ...opts, signal: ac.signal },
      ).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Revalida on focus
  useEffect(() => {
    if (!opts.revalidateOnFocus || !key) return
    const onFocus = () => {
      const e = getEntry<T>(key)
      if (Date.now() - e.timestamp > opts.ttl) {
        revalidateInBackground(key, (signal) => fetchFnRef.current(signal), opts)
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [key, opts])

  // Aborta requisição em curso quando componente desmonta
  useEffect(() => {
    if (!key) return
    return () => {
      const e = getEntry<T>(key)
      // Só aborta se ninguém mais está escutando essa chave
      // (evita abortar requisição que está sendo usada por outro componente)
      const subs = subscribers.get(key)
      if ((!subs || subs.size === 0) && e.abortCtrl && !e.abortCtrl.signal.aborted) {
        e.abortCtrl.abort()
      }
    }
  }, [key])

  const mutate = useCallback(async () => {
    if (!key) return undefined
    // Invalida cache e re-fetch forçado (não retorna cache antigo)
    const e = getEntry<T>(key)
    e.timestamp = 0
    e.inflight = undefined
    notifySubscribers(key)
    try {
      return await fetcher(
        key,
        (signal) => fetchFnRef.current(signal),
        opts,
        true,
      )
    } catch {
      return undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return {
    data: entry.data,
    error: entry.error,
    isLoading: entry.isLoading,
    isValidating: key ? !!getEntry<T>(key).inflight : false,
    mutate,
  }
}

// Helper para invalidar cache programaticamente
export function invalidateCache(key?: string) {
  if (key) {
    const e = cache.get(key)
    if (e) {
      e.timestamp = 0
      notifySubscribers(key)
    }
  } else {
    cache.clear()
  }
}

export function clearCache() {
  cache.clear()
}
