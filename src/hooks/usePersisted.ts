import { useCallback, useState } from 'react'
import { getState, setState } from '@/lib/db'

/** State kept in this browser, in IndexedDB. Read from memory, because everything is loaded before the first render. */
export const usePersisted = <T,>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] => {
  const [value, setValue] = useState<T>(() => getState(key, initial))
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const result = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        setState(key, result)
        return result
      })
    },
    [key],
  )
  return [value, update]
}
