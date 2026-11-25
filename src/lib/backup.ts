import { MAX_LAYERS, MAX_MIX, type LayerItem, type LayerState, type MixItem, type SavedSwatch } from '@/features/mixer/bench'
import { FINISH_LABEL, type Candidate, type Finish } from './buyCheck'
import { isHex } from './color'
import { STARTER } from './paints'
import type { ImportedRecipe, PaintRef, RecipeStep, StepPart } from './recipe'
import type { MetalSwatch, Origin, PaintOverride, StoredPaint } from './types'

/** Everything the user has: the collection, and mixes, recipes, swatches, wishlist and settings by key. */
export interface UserData {
  paints: StoredPaint[]
  state: Record<string, unknown>
}

export interface Backup extends UserData {
  madeAt: string
  /** Entries in the file that could not be read. */
  skipped: number
}

const APP = 'paint-mixing-lab'
const VERSION = 1
export const MAX_BACKUP_BYTES = 30_000_000

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined)
/** Colours end up in CSS, so nothing but a plain hex gets through. */
const hex = (v: unknown): string | null => (typeof v === 'string' && isHex(v) ? v.toUpperCase() : null)
const link = (v: unknown): string => (/^https:\/\//.test(str(v, 2000)) ? str(v, 2000) : '')
const date = (v: unknown): string => (Number.isNaN(Date.parse(str(v))) ? '' : str(v))
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => allowed.find((a) => a === v)

const starterIds = new Set(STARTER.map((p) => p.id))

const readMine = (v: unknown): PaintOverride => {
  if (!isObject(v)) return {}
  const mine: PaintOverride = {}
  const own = hex(v.hex)
  const strength = num(v.strength, 0.2, 4)
  const hiding = num(v.hiding, 0.2, 4)
  if (own) mine.hex = own
  if (strength !== undefined) mine.strength = strength
  if (hiding !== undefined) mine.hiding = hiding
  if (typeof v.inMixer === 'boolean') mine.inMixer = v.inMixer
  if (typeof v.checked === 'boolean') mine.checked = v.checked
  return mine
}

const readPaint = (v: unknown): StoredPaint | null => {
  if (!isObject(v) || !str(v.id) || !str(v.name).trim() || !str(v.brand).trim()) return null
  const id = str(v.id)
  const origin = oneOf<Origin>(v.origin, ['starter', 'catalog', 'custom']) ?? 'custom'
  return {
    id,
    // The label photo is looked up by the id of a built-in paint
    origin: origin === 'starter' && !starterIds.has(id) ? 'custom' : origin,
    code: str(v.code),
    name: str(v.name),
    brand: str(v.brand),
    line: str(v.line),
    type: str(v.type) || 'Acrylic',
    group: str(v.group),
    detail: str(v.detail),
    openHex: hex(v.openHex),
    wikiHex: hex(v.wikiHex),
    hexFrom: str(v.hexFrom) || null,
    normal: v.normal === true,
    seen: str(v.seen),
    nameSource: str(v.nameSource),
    score: num(v.score, 0, 10) ?? 0,
    confirmed: v.confirmed === true,
    mine: readMine(v.mine),
    addedAt: date(v.addedAt),
  }
}

const readMix = (v: unknown): MixItem | null => {
  const parts = isObject(v) ? num(v.parts, 1, 20) : undefined
  return isObject(v) && str(v.code) && parts !== undefined ? { code: str(v.code), parts } : null
}

const readLayer = (v: unknown): LayerItem | null => {
  const opacity = isObject(v) ? num(v.opacity, 0, 1) : undefined
  return isObject(v) && str(v.id) && str(v.source) && opacity !== undefined ? { id: str(v.id), source: str(v.source), opacity } : null
}

const readSwatch = (v: unknown): SavedSwatch | null => {
  if (!isObject(v)) return null
  const main = hex(v.hex)
  const kind = oneOf(v.kind, ['mix', 'layer'] as const)
  const steps = Array.isArray(v.steps) ? v.steps.map(hex) : []
  if (!str(v.id) || !main || !kind || steps.length === 0 || steps.includes(null)) return null
  return { id: str(v.id), kind, hex: main, steps: steps.filter((s) => s !== null), recipe: str(v.recipe, 2000) }
}

const readMetal = (v: unknown): MetalSwatch | null => {
  if (!isObject(v) || !Array.isArray(v.stops)) return null
  const stops = v.stops.map(hex)
  const [body, shadow, highlight] = [hex(v.body), hex(v.shadow), hex(v.highlight)]
  const angle = num(v.angle, -360, 360)
  if (!body || !shadow || !highlight || angle === undefined || stops.length < 2 || stops.includes(null)) return null
  return { code: str(v.code), name: str(v.name), role: str(v.role), body, shadow, highlight, angle, stops: stops.filter((s) => s !== null) }
}

const FINISHES = Object.keys(FINISH_LABEL) as Finish[]

const readWish = (v: unknown): Candidate | null => {
  if (!isObject(v)) return null
  const main = hex(v.hex)
  const finish = oneOf(v.finish, FINISHES)
  if (!main || !finish) return null
  return { title: str(v.title), brand: str(v.brand), code: str(v.code), name: str(v.name), hex: main, finish, metal: readMetal(v.metal), origin: v.origin === 'typed' ? 'typed' : 'open' }
}

const readRef = (v: unknown): PaintRef | null => (isObject(v) && str(v.key) ? { key: str(v.key), name: str(v.name), code: str(v.code), range: str(v.range), hex: hex(v.hex) } : null)

const readPart = (v: unknown): StepPart | null => (typeof v === 'string' ? str(v, 20000) : isObject(v) && str(v.ref) ? { ref: str(v.ref) } : null)

const readStep = (v: unknown): RecipeStep | null =>
  isObject(v) && Array.isArray(v.parts) ? { kind: v.kind === 'heading' ? 'heading' : 'step', parts: v.parts.map(readPart).filter((p) => p !== null) } : null

const readRecipe = (v: unknown): ImportedRecipe | null => {
  if (!isObject(v) || !str(v.id) || !Array.isArray(v.steps) || !Array.isArray(v.paints)) return null
  return {
    id: str(v.id),
    title: str(v.title) || 'Recipe',
    author: str(v.author),
    source: link(v.source),
    steps: v.steps.map(readStep).filter((s) => s !== null),
    paints: v.paints.map(readRef).filter((p) => p !== null),
    addedAt: date(v.addedAt),
  }
}

const readChoice = (v: unknown): { index: number; hex?: string; finish?: Finish } | null => {
  if (!isObject(v)) return null
  const typed = hex(v.hex)
  const finish = oneOf(v.finish, FINISHES)
  return { index: Math.floor(num(v.index, 0, 1000) ?? 0), ...(typed ? { hex: typed } : {}), ...(finish ? { finish } : {}) }
}

const readChoices = (v: unknown): Record<string, unknown> | undefined =>
  isObject(v)
    ? Object.fromEntries(
        Object.entries(v).flatMap(([line, c]) => {
          const made = readChoice(c)
          return made ? [[line, made]] : []
        }),
      )
    : undefined

/** Reads a backup file. Never trusts it: every value is checked, and what does not fit is left out and counted. */
export const readBackup = (text: string): { backup: Backup } | { error: string } => {
  let file: unknown
  try {
    file = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch {
    return { error: 'This file is not a backup. Choose the .json file made with Back up.' }
  }
  if (!isObject(file) || file.app !== APP || !Array.isArray(file.paints) || !isObject(file.state)) return { error: 'This file is not a Paint Mixing Lab backup.' }
  if (typeof file.version !== 'number' || file.version > VERSION) return { error: 'This backup was made by a newer version of the app. Reload the page and try again.' }

  let skipped = 0
  const all = <T>(v: unknown, read: (item: unknown) => T | null, key: (item: T) => string, max = Infinity): T[] => {
    if (!Array.isArray(v)) {
      skipped++
      return []
    }
    const seen = new Set<string>()
    const good: T[] = []
    for (const item of v) {
      const made = read(item)
      if (made === null || seen.has(key(made)) || good.length >= max) {
        skipped++
        continue
      }
      seen.add(key(made))
      good.push(made)
    }
    return good
  }
  const readers: Record<string, (v: unknown) => unknown> = {
    'pml.mix': (v) => all(v, readMix, (m) => m.code, MAX_MIX),
    'pml.layer': (v): LayerState | undefined => (isObject(v) ? { base: str(v.base), layers: all(v.layers, readLayer, (l) => l.id, MAX_LAYERS) } : undefined),
    'pml.saved': (v) => all(v, readSwatch, (s) => s.id),
    'pml.recipes': (v) => all(v, readRecipe, (r) => r.id),
    'pml.wish': (v) => all(v, readWish, (w) => [w.brand, w.name, w.code, w.hex].join('|')),
    'pml.buy': (v) => (typeof v === 'string' ? str(v, 50000) : undefined),
    'pml.buy.lines': (v) => all(v, (line) => str(line) || null, (line) => line),
    'pml.buy.choices': readChoices,
    'pml.scope': (v) => oneOf(v, ['mine', 'all']),
    'pml.view': (v) => oneOf(v, ['3d', '2d']),
    'pml.surround': (v) => oneOf(v, ['dark', 'grey', 'white']),
  }
  const paints = all(file.paints, readPaint, (p) => p.id)
  const state: Record<string, unknown> = {}
  for (const [key, read] of Object.entries(readers)) {
    if (!(key in file.state)) continue
    const value = read(file.state[key])
    if (value === undefined) skipped++
    else state[key] = value
  }
  return { backup: { paints, state, madeAt: date(file.madeAt), skipped } }
}

export const writeBackup = (data: UserData, now: Date): string => JSON.stringify({ app: APP, version: VERSION, madeAt: now.toISOString(), paints: data.paints, state: data.state }, null, 1)

/** Named after the user's own calendar day. */
export const backupName = (now: Date): string => `paint-mixing-lab-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json`

const size = (v: unknown): number => (Array.isArray(v) ? v.length : 0)

/** What is in it, to compare before replacing. */
export const countData = (d: UserData): { label: string; count: number }[] => [
  { label: 'Paints', count: d.paints.length },
  { label: 'Recipes', count: size(d.state['pml.recipes']) },
  { label: 'Swatches', count: size(d.state['pml.saved']) },
  { label: 'Wishlist', count: size(d.state['pml.wish']) },
]
