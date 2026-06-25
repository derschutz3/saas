'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Hook de debounce — atrasa a atualização do valor por `delayMs` ms.
 *
 * @param value — valor a ser debounced
 * @param delayMs — atraso em milissegundos (default 250ms)
 * @returns valor debounced (atualizado apenas após o silêncio)
 *
 * Uso: busca/filtro para evitar queries a cada tecla digitada.
 */
export function useDebounce<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastValueRef = useRef(value)

  useEffect(() => {
    // se o valor não mudou, não reinicia o timer
    if (lastValueRef.current === value) return
    lastValueRef.current = value

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setDebounced(value)
      timerRef.current = null
    }, delayMs)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [value, delayMs])

  return debounced
}

/**
 * Hook para "debounced callback" — dispara função apenas após silêncio de `delayMs`.
 * Bom para onChange de inputs que disparam queries.
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delayMs = 250,
): T {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return ((...args: Parameters<T>) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      fnRef.current(...args)
      timerRef.current = null
    }, delayMs)
  }) as T
}