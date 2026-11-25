import { STARTER } from './paints'
import type { PaintOverride, StoredPaint } from './types'

/**
 * Everything the user owns or makes lives in IndexedDB, in their own browser:
 * "paints" holds the collection, one record per paint; "state" holds mixes, layers, recipes, swatches and settings by key.
 */
const NAME = 'paint-mixing-lab'
const VERSION = 1
const SEEDED = 'seeded'
const PREFIX = 'pml.'
const OVERRIDES = 'pml.overrides'

let db: IDBDatabase | null = null
const state = new Map<string, unknown>()
let onError: (message: string) => void = () => {}

export const onSaveError = (fn: (message: string) => void): void => {
  onError = fn
}

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 5000)
    const req = indexedDB.open(NAME, VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('paints', { keyPath: 'id' })
      req.result.createObjectStore('state')
    }
    req.onsuccess = () => {
      clearTimeout(timer)
      resolve(req.result)
    }
    req.onerror = () => {
      clearTimeout(timer)
      reject(req.error ?? new Error('open'))
    }
  })

/** Runs one transaction and resolves when it is safely stored. */
const run = <T>(mode: IDBTransactionMode, work: (paints: IDBObjectStore, state: IDBObjectStore, done: (value: T) => void) => void): Promise<T> =>
  new Promise((resolve, reject) => {
    if (!db) return reject(new Error('closed'))
    const tx = db.transaction(['paints', 'state'], mode)
    let result: T
    tx.oncomplete = () => resolve(result)
    tx.onabort = () => reject(tx.error ?? new Error('abort'))
    work(tx.objectStore('paints'), tx.objectStore('state'), (value) => {
      result = value
    })
  })

const write = (work: (paints: IDBObjectStore, state: IDBObjectStore) => void): void => {
  if (!db) return
  run<void>('readwrite', work).catch(() => onError('This change was not saved. The browser storage may be full.'))
}

/** Data from before IndexedDB. The old copy is left in place. */
const readOld = (): Map<string, unknown> => {
  const old = new Map<string, unknown>()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(PREFIX)) continue
      try {
        old.set(key, JSON.parse(localStorage.getItem(key) ?? 'null'))
      } catch {
        /* one broken value must not stop the rest */
      }
    }
  } catch {
    /* storage blocked: nothing to bring over */
  }
  return old
}

const firstPaints = (old: Map<string, unknown>): StoredPaint[] => {
  const overrides = (old.get(OVERRIDES) ?? {}) as Record<string, PaintOverride>
  const addedAt = new Date().toISOString()
  return STARTER.map((p) => ({ ...p, mine: overrides[p.id] ?? {}, addedAt }))
}

export interface Boot {
  paints: StoredPaint[]
  /** False when the browser blocks IndexedDB: the app works, but forgets on reload. */
  kept: boolean
}

/** Opens the database, fills it on the first visit, and reads everything into memory. */
export const boot = async (): Promise<Boot> => {
  const old = readOld()
  try {
    db = await open()
    db.onversionchange = () => {
      db?.close()
      db = null
    }
    const paints = await run<StoredPaint[]>('readwrite', (paintStore, stateStore, done) => {
      const load = (): void => {
        const all = paintStore.getAll()
        all.onsuccess = () => done(all.result as StoredPaint[])
        stateStore.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result
          if (!cursor) return
          state.set(String(cursor.key), cursor.value)
          cursor.continue()
        }
      }
      // Checked inside the transaction, so two tabs opening together cannot both fill it
      const seeded = stateStore.get(SEEDED)
      seeded.onsuccess = () => {
        if (!seeded.result) {
          for (const p of firstPaints(old)) paintStore.put(p)
          for (const [key, value] of old) if (key !== OVERRIDES) stateStore.put(value, key)
          stateStore.put(1, SEEDED)
        }
        load()
      }
    })
    return { paints, kept: true }
  } catch {
    db?.close()
    db = null
    for (const [key, value] of old) state.set(key, value)
    return { paints: firstPaints(old), kept: false }
  }
}

export const getState = <T>(key: string, initial: T): T => (state.has(key) ? (state.get(key) as T) : initial)

export const setState = (key: string, value: unknown): void => {
  state.set(key, value)
  write((_, store) => store.put(value, key))
}

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(NAME)

/** Calls back when another tab of this browser changed the collection. */
export const onOtherTab = (fn: (paints: StoredPaint[]) => void): (() => void) => {
  const listen = (): void => {
    run<StoredPaint[]>('readonly', (paints, _, done) => {
      const all = paints.getAll()
      all.onsuccess = () => done(all.result as StoredPaint[])
    }).then(fn, () => {})
  }
  channel?.addEventListener('message', listen)
  return () => channel?.removeEventListener('message', listen)
}

let asked = false
const changed = (work: (paints: IDBObjectStore) => void): void => {
  if (!db) return
  if (!asked) {
    asked = true
    // Ask the browser not to clear the collection when the disk is short of space
    void navigator.storage?.persist?.().catch(() => false)
  }
  run<void>('readwrite', work).then(
    () => channel?.postMessage('paints'),
    () => onError('This change was not saved. The browser storage may be full.'),
  )
}

export const putPaints = (paints: StoredPaint[]): void => changed((store) => paints.forEach((p) => store.put(p)))
export const deletePaints = (ids: string[]): void => changed((store) => ids.forEach((id) => store.delete(id)))
