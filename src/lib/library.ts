import type { UsablePaint } from './types'

type Row = [id: string, brand: string, set: string, code: string, name: string, hex: string, group: string, source: string]

export const toLibraryPaint = ([id, brand, set, code, name, hex, group, source]: Row): UsablePaint => ({
  id,
  owned: false,
  code,
  name,
  brand,
  line: set,
  type: 'Acrylic',
  detail: '',
  group,
  openHex: hex,
  wikiHex: null,
  normal: true,
  seen: '',
  nameSource: source,
  score: 0,
  confirmed: false,
  metal: null,
  hex,
  hexSource: source,
  references: [],
  gap: 0,
  strength: 1,
  hiding: 1,
  inMixer: true,
  checked: false,
})

let pending: Promise<UsablePaint[]> | null = null

/** Paints the user does not own, loaded once and only when asked for. */
export const loadLibrary = (): Promise<UsablePaint[]> => {
  pending ??= fetch(`${import.meta.env.BASE_URL}library.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`library ${res.status}`)
      return res.json() as Promise<Row[]>
    })
    .then((rows) => rows.map(toLibraryPaint))
    .catch((error: unknown) => {
      pending = null
      throw error
    })
  return pending
}
