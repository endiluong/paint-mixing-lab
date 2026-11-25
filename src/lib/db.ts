import type { UserData } from './backup'
import { START_WITH_INVENTORY, STARTER } from './paints'
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
/** True once the database was opened, even if it was closed later. */
let kept = false
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
    try {
      work(tx.objectStore('paints'), tx.objectStore('state'), (value) => {
        result = value
      })
    } catch (error) {
      // A record the browser refuses throws here, and the steps before it would still be stored
      tx.abort()
      reject(error)
    }
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
  // Changed paints in the old storage mean that the built-in inventory was in use
  if (!START_WITH_INVENTORY && Object.keys(overrides).length === 0) return []
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
    kept = true
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
    kept = false
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
  const listen = (e: MessageEvent): void => {
    if (e.data !== 'paints') return
    run<StoredPaint[]>('readonly', (paints, _, done) => {
      const all = paints.getAll()
      all.onsuccess = () => done(all.result as StoredPaint[])
    }).then(fn, () => {})
  }
  channel?.addEventListener('message', listen)
  return () => channel?.removeEventListener('message', listen)
}

let asked = false
/** Asks the browser not to clear the collection when the disk is short of space. */
const askToKeep = (): void => {
  if (asked) return
  asked = true
  void globalThis.navigator?.storage?.persist?.().catch(() => false)
}

const changed = (work: (paints: IDBObjectStore) => void): void => {
  if (!db) return
  askToKeep()
  run<void>('readwrite', work).then(
    () => channel?.postMessage('paints'),
    () => onError('This change was not saved. The browser storage may be full.'),
  )
}

export const putPaints = (paints: StoredPaint[]): void => changed((store) => paints.forEach((p) => store.put(p)))
export const deletePaints = (ids: string[]): void => changed((store) => ids.forEach((id) => store.delete(id)))

const readAll = (): Promise<UserData> =>
  run<UserData>('readonly', (paintStore, stateStore, done) => {
    const data: UserData = { paints: [], state: {} }
    done(data)
    const all = paintStore.getAll()
    all.onsuccess = () => {
      data.paints = all.result as StoredPaint[]
    }
    stateStore.openCursor().onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result
      if (!cursor) return
      if (cursor.key !== SEEDED) data.state[String(cursor.key)] = cursor.value
      cursor.continue()
    }
  })

/** Everything the user has, as stored now. `shown` is the collection on screen, used when the browser blocks storage. */
export const snapshot = async (shown: StoredPaint[]): Promise<UserData> => (db ? readAll() : { paints: shown, state: Object.fromEntries([...state].filter(([key]) => key !== SEEDED)) })

const remember = (data: UserData): void => {
  state.clear()
  for (const [key, value] of Object.entries(data.state)) state.set(key, value)
}

/** Replaces all data in one transaction: if any of it cannot be stored, nothing changes. */
export const replaceAll = async (data: UserData): Promise<Boot> => {
  if (kept) {
    askToKeep()
    await run<void>('readwrite', (paintStore, stateStore) => {
      paintStore.clear()
      stateStore.clear()
      for (const p of data.paints) paintStore.put(p)
      for (const [key, value] of Object.entries(data.state)) stateStore.put(value, key)
      stateStore.put(1, SEEDED)
    })
  }
  remember(data)
  channel?.postMessage('all')
  return { paints: data.paints, kept }
}

/** Calls back when another tab of this browser replaced all data. */
export const onReplaced = (fn: (boot: Boot) => void): (() => void) => {
  const listen = (e: MessageEvent): void => {
    if (e.data !== 'all' || !kept) return
    readAll().then(
      (data) => {
        remember(data)
        fn({ paints: data.paints, kept })
      },
      () => {},
    )
  }
  channel?.addEventListener('message', listen)
  return () => channel?.removeEventListener('message', listen)
}
