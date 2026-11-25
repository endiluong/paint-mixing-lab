import { isHex } from './color'
import { STARTER } from './paints'
import type { Paint, PaintFields, PaintOverride, PaintRecord, StoredPaint } from './types'

/** Types that are ordinary opaque acrylic and join the graph by default. */
const NORMAL_TYPES = new Set(['Acrylic', 'Tube acrylic'])
export const isNormalType = (type: string): boolean => NORMAL_TYPES.has(type)

export const PAINT_TYPES = ['Acrylic', 'Tube acrylic', 'Metal', 'Ink', 'Xpress', 'Quick Gen', 'Fluo', 'Special FX']
export const COLOR_GROUPS = ['White', 'Yellow', 'Orange', 'Skin / Flesh', 'Red', 'Magenta / Pink', 'Purple / Violet', 'Blue', 'Turquoise', 'Green', 'Brown', 'Grey', 'Black', 'Gold', 'Silver', 'Copper', 'Metal']

const plain = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const codeKey = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** The paint already in the collection with the same brand and code (or the same brand, line and name when there is no code). */
export const findTwin = <T extends Pick<Paint, 'id' | 'brand' | 'line' | 'code' | 'name'>>(f: Pick<PaintFields, 'brand' | 'line' | 'code' | 'name'>, paints: T[], ignoreId: string | null): T | null =>
  paints.find((p) => {
    if (p.id === ignoreId || plain(p.brand) !== plain(f.brand)) return false
    const a = codeKey(p.code)
    const b = codeKey(f.code)
    return a && b ? a === b : plain(p.name) === plain(f.name) && plain(p.line) === plain(f.line)
  }) ?? null

/** First problem with the form, in plain words, or null. */
export const problemWith = (f: PaintFields, paints: Paint[], ignoreId: string | null): string | null => {
  if (!f.name.trim()) return 'Write the name on the label.'
  if (!f.brand.trim()) return 'Write the brand.'
  if (!f.group) return 'Choose a color group.'
  if (f.hex && !isHex(f.hex)) return 'Write the hex as # and six digits, like #8A2B2B.'
  const twin = findTwin(f, paints, ignoreId)
  return twin ? `You already have ${[twin.brand, twin.name, twin.code].filter(Boolean).join(' ')}.` : null
}

const clean = (f: PaintFields): PaintFields => ({
  ...f,
  name: f.name.trim(),
  code: f.code.trim(),
  brand: f.brand.trim(),
  line: f.line.trim(),
  hex: f.hex ? f.hex.toUpperCase() : null,
})

/** A paint from the paint data that a new record starts from. */
export interface Source {
  id: string
  hex: string
  from: string
  brand: string
  code: string
  name: string
}

export const createPaint = (input: PaintFields, source: Source | null): StoredPaint => {
  const f = clean(input)
  const starter = STARTER.find((p) => codeKey(p.code) === codeKey(f.code) && p.brand === f.brand)
  const normal = isNormalType(f.type)
  const addedAt = new Date().toISOString()
  // A built-in paint that was removed comes back with its sources and label photo
  if (starter) return editPaint({ ...starter, addedAt }, f, source?.hex ?? null)
  const same = source !== null && f.hex === source.hex.toUpperCase()
  return {
    id: source?.id ?? `my-${crypto.randomUUID()}`,
    origin: source ? 'catalog' : 'custom',
    code: f.code,
    name: f.name,
    brand: f.brand,
    line: f.line,
    type: f.type,
    group: f.group,
    detail: '',
    openHex: source ? source.hex.toUpperCase() : f.hex,
    wikiHex: null,
    hexFrom: source ? source.from : 'Yours',
    normal,
    seen: '',
    nameSource: source ? source.from : 'You',
    score: 0,
    confirmed: true,
    mine: { ...(source && !same && f.hex ? { hex: f.hex } : {}), ...(f.inMixer !== normal ? { inMixer: f.inMixer } : {}) },
    addedAt,
  }
}

/** Applies a small change: hex, strength, hiding, mixer, checked. A paint the user typed has no other source, so its hex is simply replaced. */
export const patchPaint = (p: StoredPaint, patch: PaintOverride): StoredPaint => {
  const { hex, ...rest } = patch
  const next = { ...p, mine: { ...p.mine, ...rest } }
  if (!('hex' in patch)) return next
  return p.origin === 'custom' ? { ...next, openHex: hex ?? null } : { ...next, mine: { ...next.mine, hex } }
}

/** Applies the form. `shownHex` is the hex the form opened with: an unchanged one does not become the user's own value. */
export const editPaint = (p: StoredPaint, input: PaintFields, shownHex: string | null): StoredPaint => {
  const f = clean(input)
  const normal = f.type === p.type ? p.normal : isNormalType(f.type)
  let next: StoredPaint = { ...p, code: f.code, name: f.name, brand: f.brand, line: f.line, type: f.type, group: f.group, normal, detail: f.type === p.type ? p.detail : '' }
  if (f.hex && f.hex !== shownHex?.toUpperCase()) next = patchPaint(next, { hex: f.hex })
  if (!f.hex && shownHex) next = patchPaint(next, { hex: undefined })
  // Without a hex the box cannot be ticked, so an empty box says nothing then
  if (f.hex) next = patchPaint(next, { inMixer: f.inMixer === normal ? undefined : f.inMixer })
  return next
}

/** Built-in paints go back to how they came; others lose hex, strength, hiding and mixer changes. */
export const resetPaint = (p: StoredPaint): StoredPaint => {
  const starter = p.origin === 'starter' ? STARTER.find((s) => s.id === p.id) : undefined
  return starter ? { ...starter, addedAt: p.addedAt } : { ...p, mine: {} }
}

export const toFields = (p: PaintRecord & { hex: string | null; inMixer: boolean }): PaintFields => ({ name: p.name, code: p.code, brand: p.brand, line: p.line, type: p.type, group: p.group, hex: p.hex, inMixer: p.hex ? p.inMixer : p.normal })

/** Id of a paint from the paint data. The same paint always gets the same id, so saved mixes keep working. */
export const catalogId = (r: { brand: string; code: string; name: string; set: string }): string => `${r.brand}|${r.code || `${r.set}|${plain(r.name.replace(/\(.*?\)/g, ' ').replace(/grey/gi, 'gray'))}`}`
