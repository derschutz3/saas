/**
 * Cache em memória para responses de endpoints read-only.
 *
 * Evita queries repetidas em endpoints que raramente mudam (categorias,
 * unidades de medida). Por tenant (cada tenant tem seu próprio cache).
 *
 * Design:
 *  - TTL configurável por chave (default 60s para dados "quase estáticos")
 *  - Invalidação via `bump(key)` ou `bumpByPrefix(prefix)` quando há escrita
 *  - Limite de tamanho (LRU simples: quando excede, remove entradas mais antigas)
 *  - Singleton thread-safe (Node.js é single-threaded por canal de event loop)
 */

type CacheEntry<T = unknown> = {
  data: T
  expiresAt: number
  createdAt: number
}

class RouteCache {
  private store = new Map<string, CacheEntry>()
  private maxEntries = 1000

  get<T>(key: string): T | undefined {
    const e = this.store.get(key)
    if (!e) return undefined
    if (Date.now() > e.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return e.data as T
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    if (this.store.size >= this.maxEntries) {
      // remove a entrada mais antiga (FIFO simples — basta para este caso)
      const firstKey = this.store.keys().next().value
      if (firstKey !== undefined) this.store.delete(firstKey)
    }
    this.store.set(key, { data, createdAt: Date.now(), expiresAt: Date.now() + ttlMs })
  }

  bump(key: string): void {
    this.store.delete(key)
  }

  bumpByPrefix(prefix: string): number {
    let n = 0
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(prefix)) {
        this.store.delete(k)
        n++
      }
    }
    return n
  }

  clear(): void {
    this.store.clear()
  }

  stats(): { size: number; maxEntries: number } {
    return { size: this.store.size, maxEntries: this.maxEntries }
  }
}

export const routeCache = new RouteCache()

/**
 * Helper para cachear responses de uma rota. Usa uma chave que inclui
 * tenant + query params para isolamento entre tenants.
 *
 * Uso:
 *   router.get('/categories', cacheRoute({ ttlMs: 60_000, key: (req) => `cat:${ctx.tenantId}` }), handler)
 */
export function cacheRoute(opts: { ttlMs: number; key: (req: Request) => string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const k = opts.key(req)
      if (!k) return next()
      const cached = routeCache.get(k)
      if (cached) {
        res.setHeader('X-Cache', 'HIT')
        res.setHeader('Cache-Control', `private, max-age=${Math.floor(opts.ttlMs / 1000)}`)
        res.json(cached)
        return
      }
      // hooka res.json para salvar no cache após o handler rodar
      const originalJson = res.json.bind(res)
      res.json = (body: unknown) => {
        if (res.statusCode === 200) {
          routeCache.set(k, body, opts.ttlMs)
          res.setHeader('X-Cache', 'MISS')
          res.setHeader('Cache-Control', `private, max-age=${Math.floor(opts.ttlMs / 1000)}`)
        }
        return originalJson(body)
      }
      next()
    } catch {
      next()
    }
  }
}

import type { Request, Response, NextFunction } from 'express'