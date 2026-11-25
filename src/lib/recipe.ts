import { isHex } from './color'
import type { Paint } from './types'

export interface PaintRef {
  key: string
  name: string
  code: string
  range: string
  hex: string | null
}

export type StepPart = string | { ref: string }

export interface RecipeStep {
  kind: 'heading' | 'step'
  parts: StepPart[]
}

export interface ImportedRecipe {
  id: string
  title: string
  author: string
  source: string
  steps: RecipeStep[]
  paints: PaintRef[]
  addedAt: string
}

const ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ' }

const decode = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) return String.fromCodePoint(parseInt(body.slice(2), 16))
    if (body.startsWith('#')) return String.fromCodePoint(Number(body.slice(1)))
    return ENTITIES[body.toLowerCase()] ?? whole
  })

const normal = (s: string): string => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/grey/g, 'gray').replace(/[^a-z0-9]/g, '')
const normalCode = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isRecord) : [])

/** Splits ":Range/Paint:" tokens out of a step. */
export const splitTokens = (content: string, known: Set<string>): StepPart[] => {
  const parts: StepPart[] = []
  let last = 0
  for (const m of content.matchAll(/:([A-Za-z0-9]+\/[A-Za-z0-9_.-]+):/g)) {
    if (!known.has(m[1])) continue
    if (m.index > last) parts.push(content.slice(last, m.index))
    parts.push({ ref: m[1] })
    last = m.index + m[0].length
  }
  if (last < content.length) parts.push(content.slice(last))
  return parts.filter((p) => typeof p !== 'string' || p.trim() !== '')
}

const meta = (html: string, property: string): string => {
  const tag = html.match(new RegExp(`<meta[^>]*property="${property}"[^>]*>`, 'i'))?.[0] ?? ''
  return decode(tag.match(/content="([^"]*)"/i)?.[1] ?? '')
}

/** Reads a Paint Pad recipe page the user saved or whose source they pasted. Returns null when it is not one. */
export const parseRecipePage = (html: string): ImportedRecipe | null => {
  const raw = html.match(/data-recipe-page-props="([^"]*)"/)?.[1]
  if (!raw) return null
  let props: unknown
  try {
    props = JSON.parse(decode(raw))
  } catch {
    return null
  }
  if (!isRecord(props)) return null
  const collection = isRecord(props.paintCollection) ? props.paintCollection : {}
  const content = isRecord(props.recipeContent) ? props.recipeContent : {}
  const ranges = new Map(list(collection.paintRanges).map((r) => [str(r.id), str(r.name)]))
  const paints: PaintRef[] = list(collection.paints).map((p) => {
    const color = isRecord(p.swatchStyle) ? str(p.swatchStyle.color) : ''
    return {
      key: str(p.fullIdentifier),
      name: str(p.name),
      code: str(p.manufacturerCode),
      range: ranges.get(str(p.paintRangeId)) ?? '',
      hex: isHex(color) ? color.toUpperCase() : null,
    }
  })
  const known = new Set(paints.map((p) => p.key))
  const steps: RecipeStep[] = list(content.items).map((i) => ({
    kind: str(i.type) === 'heading' ? 'heading' : 'step',
    parts: splitTokens(str(i.content), known),
  }))
  const heading = meta(html, 'og:title') || decode(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').replace(/\s*\|\s*Paint Pad\s*$/, '')
  const by = heading.lastIndexOf(' by ')
  const url = meta(html, 'og:url')
  return {
    id: `pp-${str(props.recipeId) || Date.now()}`,
    title: by > 0 ? heading.slice(0, by) : heading || 'Recipe',
    author: by > 0 ? heading.slice(by + 4) : '',
    source: /^https:\/\/paintpad\.app\//.test(url) ? url : '',
    steps,
    paints,
    addedAt: new Date().toISOString(),
  }
}

/** Turns typed text into a recipe: first line is the title, a line ending in ":" is a heading, the rest are steps. Owned paints are recognised by code or full name. */
export const parseRecipeText = (text: string, paints: Paint[], source = ''): ImportedRecipe | null => {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return null
  const names = [...paints].sort((a, b) => b.name.length - a.name.length)
  const used = new Map<string, PaintRef>()
  const note = (p: Paint): StepPart => {
    used.set(p.id, { key: p.id, name: p.name, code: p.code, range: `${p.brand} ${p.line}`, hex: p.hex })
    return { ref: p.id }
  }
  const scan = (line: string): StepPart[] => {
    const lower = line.toLowerCase()
    for (const p of names) {
      const code = p.code.toLowerCase()
      const bare = /^\d\d\.\d{3}$/.test(p.code) ? p.code.replace('.', '') : ''
      for (const needle of [code, bare, p.name.length >= 6 ? p.name.toLowerCase() : '']) {
        if (!needle) continue
        const i = lower.indexOf(needle)
        if (i < 0) continue
        const before = lower[i - 1] ?? ' '
        const after = lower[i + needle.length] ?? ' '
        if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) continue
        return [...scan(line.slice(0, i)), note(p), ...scan(line.slice(i + needle.length))]
      }
    }
    return line.trim() ? [line] : []
  }
  const steps: RecipeStep[] = lines.slice(1).map((line) => (line.endsWith(':') ? { kind: 'heading', parts: [line.slice(0, -1)] } : { kind: 'step', parts: scan(line) }))
  return { id: `my-${Date.now()}`, title: lines[0], author: '', source: /^https:\/\//.test(source) ? source : '', steps, paints: [...used.values()], addedAt: new Date().toISOString() }
}

/** The paint the user owns for a recipe paint, or null. Code first, then brand plus exact name. */
export const findOwned = (ref: PaintRef, paints: Paint[]): Paint | null => {
  if (ref.code) {
    const byCode = paints.find((p) => normalCode(p.code) === normalCode(ref.code))
    if (byCode) return byCode
  }
  const range = ref.range.toLowerCase()
  return paints.find((p) => normal(p.name) === normal(ref.name) && range.includes(p.brand.split(' ')[0].toLowerCase()) && (range.includes(p.line.toLowerCase()) || p.brand !== 'Vallejo')) ?? null
}

/** "2:1" or "2:2:1" at the start of or inside a step. */
export const stepRatio = (parts: StepPart[]): number[] | null => {
  const text = parts.filter((p): p is string => typeof p === 'string').join(' ')
  const m = text.match(/\b\d{1,2}(?:\s*:\s*\d{1,2}){1,3}\b/)
  return m ? m[0].split(':').map((n) => Number(n.trim())) : null
}
