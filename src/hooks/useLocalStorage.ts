import { useCallback, useState } from 'react'

const read = <T,>(key: string, initial: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? initial : (JSON.parse(raw) as T)
  } catch {
    return initial
  }
}

/** State kept in this browser. Falls back to plain state when storage is blocked. */
export const useLocalStorage = <T,>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] => {
  const [value, setValue] = useState<T>(() => read(key, initial))
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const result = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        try {
          localStorage.setItem(key, JSON.stringify(result))
        } catch {
          /* storage full or blocked: keep working in memory */
        }
        return result
      })
    },
    [key],
  )
  return [value, update]
}
