import { finishOf, loadReference, type Finish, type RefPaint } from './buyCheck'
import { catalogId, isNormalType, toFields, type Source } from './collection'
import { guessGroup } from './group'
import { loadLibrary } from './library'
import { buildPaint, STARTER } from './paints'
import type { PaintFields, UsablePaint } from './types'

/** A paint that can be added to the collection with one click. */
export interface CatalogPaint {
  fields: PaintFields
  source: Source
  search: string
  code: string
}

const TYPE: Record<Finish, string> = { normal: 'Acrylic', metal: 'Metal', ink: 'Ink', contrast: 'Xpress', wash: 'Ink', fluo: 'Fluo', special: 'Special FX', primer: 'Special FX' }

const bare = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const key = (brand: string, code: string, set: string, name: string): string => (code ? `${brand}|${bare(code)}` : `${brand}|${set}|${bare(name)}`)

const make = (fields: PaintFields, id: string, from: string): CatalogPaint => ({
  fields,
  source: { id, hex: fields.hex ?? '', from, brand: fields.brand, code: fields.code, name: fields.name },
  search: `${fields.name} ${fields.code} ${fields.brand} ${fields.line}`.toLowerCase(),
  code: bare(fields.code),
})

/** Built-in paints first, because they carry the checked name, then the library with its charts, then the open dataset. */
export const buildCatalog = (refs: RefPaint[], library: UsablePaint[]): CatalogPaint[] => {
  const out = new Map<string, CatalogPaint>()
  const add = (k: string, p: CatalogPaint): void => {
    if (!out.has(k)) out.set(k, p)
  }
  for (const s of STARTER) {
    const p = buildPaint(s)
    add(key(p.brand, p.code, p.line, p.name), make(toFields(p), p.id, p.hexSource))
  }
  for (const p of library) add(key(p.brand, p.code, p.line, p.name), make(toFields(p), p.id, p.hexSource))
  for (const r of refs) {
    const set = r.set.replace(/\s+/g, ' ')
    const type = TYPE[finishOf(set, r.name)]
    const from = r.metal && /true metallic/i.test(set) ? 'Vallejo TMM chart' : /squidmar/i.test(set) ? 'Vallejo Squidmar chart' : 'miniature-paints dataset'
    const group = type === 'Metal' && !guessGroup(r.name, null) ? (/(gold|brass)/i.test(r.name) ? 'Gold' : /(copper|bronze)/i.test(r.name) ? 'Copper' : /(silver|steel|chrome|alumin)/i.test(r.name) ? 'Silver' : 'Metal') : (guessGroup(r.name, r.hex) ?? '')
    const fields: PaintFields = { name: r.name, code: r.code, brand: r.brand, line: set, type, group, hex: r.hex.toUpperCase(), inMixer: isNormalType(type) }
    add(key(r.brand, r.code, set, r.name), make(fields, catalogId({ ...r, set }), from))
  }
  return [...out.values()]
}

let pending: Promise<CatalogPaint[]> | null = null

export const loadCatalog = (): Promise<CatalogPaint[]> => {
  pending ??= Promise.all([loadReference(`${import.meta.env.BASE_URL}reference.json`), loadLibrary()])
    .then(([refs, library]) => buildCatalog(refs, library))
    .catch((error: unknown) => {
      pending = null
      throw error
    })
  return pending
}

/** Every word must be somewhere in the name, code, brand or line. An exact code comes first, then names that start with the query. */
export const searchCatalog = (query: string, catalog: CatalogPaint[], limit = 40): CatalogPaint[] => {
  const q = query.trim().toLowerCase()
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const code = bare(q)
  const rank = (p: CatalogPaint): number => (code && p.code === code ? 0 : p.fields.name.toLowerCase() === q ? 1 : p.search.startsWith(q) ? 2 : 3)
  return catalog
    .filter((p) => (/\d/.test(code) && p.code !== '' && p.code.includes(code)) || words.every((w) => p.search.includes(w)))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit)
}
