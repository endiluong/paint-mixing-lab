import { hexToLab, labDistance } from './color'
import { findMixes, type Recipe } from './match'
import { isUsable } from './paints'
import type { Paint, UsablePaint } from './types'

export interface RefPaint {
  brand: string
  name: string
  code: string
  set: string
  hex: string
}

export type Finish = 'normal' | 'metal' | 'ink' | 'contrast' | 'wash' | 'fluo' | 'special' | 'primer'

export const FINISH_LABEL: Record<Finish, string> = {
  normal: 'normal paint',
  metal: 'metallic',
  ink: 'ink or transparent',
  contrast: 'contrast type (Xpress, Speedpaint)',
  wash: 'wash or glaze',
  fluo: 'fluorescent',
  special: 'special effect or medium',
  primer: 'primer',
}

/** OKLab distances. Below DUPLICATE two swatches are hard to tell apart; below CLOSE they do the same job. */
export const DUPLICATE = 0.02
export const CLOSE = 0.05

const METAL_NAME = /\b(gold|silver|copper|bronze|brass|steel|chrome|aluminium|aluminum|gunmetal|gun metal|pewter|platinum|metallic)\b/i
const COLOUR_WORD = /\b(yellow|grey|gray|blue|brown|flesh|skin|red|green|orange|white|black|ochre|sand)\b/i

export const finishOf = (set: string, name: string): Finish => {
  if (/fluo|neon|phosphor/i.test(`${set} ${name}`)) return 'fluo'
  if (/xpress|contrast|speedpaint|quick gen|instant colors|one-coat|dipping/i.test(set)) return 'contrast'
  if (/metal|alchemy|liquid gold|turbo|chameleon|pearl|shiny|glitter/i.test(set)) return 'metal'
  if (/wash|\bshade\b|glaz|\btone\b/i.test(set)) return 'wash'
  if (/\bink|transparent|\bclear\b|candy|watercolor/i.test(set)) return 'ink'
  if (/primer|undercoat/i.test(set)) return 'primer'
  if (/special fx|weathering|technical|soil|fx range|auxiliary|surface\b/i.test(set) || /\b(medium|varnish|thinner|retarder|mask|putty)\b/i.test(name)) return 'special'
  if (METAL_NAME.test(name) && !COLOUR_WORD.test(name)) return 'metal'
  return 'normal'
}

export const ownedFinish = (p: Paint): Finish => {
  if (p.type === 'Metal') return 'metal'
  if (p.type === 'Ink') return 'ink'
  if (p.type === 'Xpress' || p.type === 'Quick Gen') return 'contrast'
  if (p.type === 'Fluo') return 'fluo'
  if (p.type === 'Special FX') return 'special'
  return 'normal'
}

const plain = (s: string): string => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/grey/g, 'gray').replace(/[^a-z0-9]+/g, ' ').trim()
const codeKey = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

export interface Query {
  raw: string
  hex: string | null
  code: string
  name: string
  brand: string
}

const BRAND_WORDS: [RegExp, string][] = [
  [/\bvallejo\b/i, 'Vallejo'], [/\bak(?:\s+interactive)?\b/i, 'AK Interactive'], [/\bscale\s*75\b|\bscalecolou?r\b/i, 'Scale75'], [/\bcitadel\b|\bgames workshop\b/i, 'Citadel'],
  [/\barmy\s+painter\b/i, 'Army Painter'], [/\btamiya\b/i, 'Tamiya'], [/\bmr\.?\s*hobby\b|\bmr\.?\s*colou?r\b/i, 'Mr Hobby'], [/\breaper\b/i, 'Reaper'], [/\bp3\b/i, 'P3'],
  [/\bgreen\s+stuff(?:\s+world)?\b/i, 'Green Stuff World'], [/\bkimera\b/i, 'Kimera Kolors'], [/\bmonument\b|\bpro\s*acryl\b/i, 'Monument'], [/\bwarcolours\b/i, 'Warcolours'],
  [/\bammo\b|\bmig\b/i, 'Ammo by Mig'], [/\bhumbrol\b/i, 'Humbrol'], [/\brevell\b/i, 'Revell'], [/\bliquitex\b/i, 'Liquitex'], [/\bgolden\b(?=\s+(?:heavy|fluid|high|open|so))/i, 'Golden'],
]

/** Reads one shopping-list line: any of brand, code, name and #hex, in any order. */
export const parseQuery = (line: string): Query => {
  let rest = line.trim()
  const hexMatch = rest.match(/#[0-9a-f]{6}\b/i)?.[0] ?? null
  if (hexMatch) rest = rest.replace(hexMatch, ' ')
  let brand = ''
  for (const [re, name] of BRAND_WORDS) {
    if (re.test(rest)) {
      brand = name
      rest = rest.replace(re, ' ')
      break
    }
  }
  const codeMatch = rest.match(/\b(?:\d{2}[.,\s]\s?\d{3}|(?:AK|SART|XF|TS|LP|GX|AS)[-. ]?\d{1,5}|[A-Z]{1,6}[-.]?\d{2,6}|\d{5})\b/i)?.[0] ?? ''
  if (codeMatch) rest = rest.replace(codeMatch, ' ')
  const name = rest.replace(/[,;|]+/g, ' ').replace(/\s+/g, ' ').replace(/^[-–\s]+|[-–\s]+$/g, '')
  // "AK 11049": the brand word is also the start of the code
  const code = brand === 'AK Interactive' && /^\d{5}$/.test(codeMatch) ? `AK${codeMatch}` : codeMatch
  return { raw: line.trim(), hex: hexMatch ? hexMatch.toUpperCase() : null, code, name, brand }
}

export interface Lookup {
  ref: RefPaint
  /** True when the code matched, or the full name matched and nothing in the query contradicts it. */
  exact: boolean
  why: string
}

/** Airbrush and spray versions come after the bottle version of the same name. */
const THIN = /\bair\b|spray|hobby paint|primer/i

/** Reference paints for a query, best first. A code that is not found never turns into a guess by a similar code. */
export const lookup = (q: Query, refs: RefPaint[]): Lookup[] => {
  const pool = q.brand ? refs.filter((r) => r.brand === q.brand) : refs
  const name = plain(q.name)
  const code = codeKey(q.code)
  const seen = new Set<string>()
  const out: Lookup[] = []
  const push = (ref: RefPaint, exact: boolean, why: string): void => {
    const key = `${ref.brand}|${ref.code}|${ref.name}|${ref.set}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push({ ref, exact, why })
    }
  }
  const byCode = code ? pool.filter((r) => codeKey(r.code) === code) : []
  for (const r of byCode) {
    const agrees = !name || plain(r.name) === name || plain(r.name).includes(name) || name.includes(plain(r.name))
    push(r, agrees, agrees ? 'code' : 'the code matches but the name is different')
  }
  if (name.length >= 3) {
    const same = pool.filter((r) => plain(r.name) === name)
    const sure = !code && new Set(same.map((r) => r.hex)).size === 1
    for (const r of same) push(r, sure, code ? 'the name matches but the code is different' : sure ? 'name' : 'several paints have this name')
    if (out.length < 12) {
      const words = name.split(' ')
      for (const r of pool) {
        const n = plain(r.name)
        if (words.every((w) => n.split(' ').includes(w))) push(r, false, 'part of the name matches')
        if (out.length >= 12) break
      }
    }
  }
  return out.sort((a, b) => Number(b.exact) - Number(a.exact) || Number(THIN.test(a.ref.set)) - Number(THIN.test(b.ref.set))).slice(0, 12)
}

export interface Candidate {
  title: string
  brand: string
  code: string
  name: string
  hex: string
  finish: Finish
  /** "open" when the hex is from the open dataset, "typed" when the user gave it. */
  origin: 'open' | 'typed'
}

export interface Neighbour {
  paint: Paint
  hex: string
  distance: number
  /** Distance when compared with each other hex known for the owned paint. */
  others: number[]
}

export type VerdictKind = 'own' | 'duplicate' | 'close' | 'mix' | 'gap'

export interface Verdict {
  kind: VerdictKind
  owned: Paint | null
  neighbours: Neighbour[]
  mixes: Recipe[]
  /** Another source for the nearest owned paints would change the answer. */
  depends: boolean
}

const level = (d: number): number => (d < DUPLICATE ? 0 : d < CLOSE ? 1 : 2)

/** Uses the same dataset on both sides when possible, because different swatch sets disagree on the same paint. */
const comparableHex = (p: Paint, origin: Candidate['origin']): string | null => (origin === 'open' && p.hexSource !== 'Yours' ? (p.openHex ?? p.hex) : p.hex)

export const findOwnedCandidate = (c: Pick<Candidate, 'brand' | 'code' | 'name'>, paints: Paint[]): Paint | null => {
  const code = codeKey(c.code)
  if (code) {
    const hit = paints.find((p) => codeKey(p.code) === code && (!c.brand || p.brand === c.brand))
    if (hit) return hit
  }
  if (code || c.brand !== 'Scale75') return null
  return paints.find((p) => p.brand === 'Scale75' && plain(p.name) === plain(c.name)) ?? null
}

export const checkPaint = (c: Candidate, paints: Paint[]): Verdict => {
  const owned = findOwnedCandidate(c, paints)
  const lab = hexToLab(c.hex)
  const neighbours = paints
    .filter((p) => p !== owned && ownedFinish(p) === c.finish)
    .flatMap<Neighbour>((paint) => {
      const hex = comparableHex(paint, c.origin)
      if (!hex) return []
      const known = [paint.hex, ...paint.references.map((r) => r.hex)].filter((h): h is string => h !== null && h !== hex)
      return [{ paint, hex, distance: labDistance(hexToLab(hex), lab), others: known.map((h) => labDistance(hexToLab(h), lab)) }]
    })
    .sort((a, b) => a.distance - b.distance)
  const best = neighbours[0]
  const reach = Math.min(...neighbours.slice(0, 40).flatMap((n) => [n.distance, ...n.others]), Infinity)
  const worst = best ? Math.max(best.distance, ...best.others) : Infinity
  const now = best ? level(best.distance) : 2
  const depends = !owned && best !== undefined && (now < 2 ? level(worst) === 2 : level(reach) < 2)

  let mixes: Recipe[] = []
  if (c.finish === 'normal' && now === 2) {
    const pool = paints.filter(isUsable).map<UsablePaint>((p) => ({ ...p, hex: comparableHex(p, c.origin) ?? p.hex }))
    mixes = findMixes(c.hex, pool, 2, 3).filter((m) => m.distance < DUPLICATE)
  }
  const kind: VerdictKind = owned ? 'own' : now === 0 ? 'duplicate' : now === 1 ? 'close' : mixes.length > 0 ? 'mix' : 'gap'
  return { kind, owned, neighbours: neighbours.slice(0, 4), mixes, depends }
}

export const loadReference = async (url: string): Promise<RefPaint[]> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`reference ${res.status}`)
  const rows = (await res.json()) as [string, string, string, string, string][]
  return rows.map(([brand, name, code, set, hex]) => ({ brand, name, code, set, hex }))
}
