import openData from '@/data/paints.json'
import squidmarData from '@/data/squidmar.json'
import tmmData from '@/data/tmm.json'
import { hexToLab, isHex, labDistance } from './color'
import type { MetalSwatch, Paint, PaintOverride, PaintRecord, StoredPaint, UsablePaint } from './types'

/** Optional file, for `npm run dev` only, so a built page never ships it. Without it every paint falls back to the open dataset. */
const padFiles = import.meta.env.DEV ? import.meta.glob<Record<string, string>>('@/data/paintpad-hex.json', { eager: true, import: 'default' }) : {}
const padHex: Record<string, string> = Object.values(padFiles)[0] ?? {}

export const TMM = tmmData as MetalSwatch[]
export const SQUIDMAR = squidmarData as { code: string; name: string; set: string; hex: string; metal: MetalSwatch | null }[]
const tmmByCode = new Map(TMM.map((m) => [m.code, m]))

const RECORDS = openData as PaintRecord[]

/**
 * The owner's inventory. `npm run dev` starts from it; a built page starts empty and uses it only as paint data.
 */
export const START_WITH_INVENTORY = import.meta.env.DEV

/** The built-in inventory. */
export const STARTER: StoredPaint[] = RECORDS.map((r) => ({ ...r, id: r.code, origin: 'starter', hexFrom: null, mine: {}, addedAt: '' }))

export const buildPaint = (record: StoredPaint, owned = true): Paint => {
  const { mine: override, hexFrom } = record
  const metal = record.brand === 'Vallejo' ? (tmmByCode.get(record.code) ?? null) : null
  const pad = record.origin === 'starter' ? (padHex[record.code] ?? null) : null
  const sources = [
    { hex: metal?.body ?? null, source: 'Vallejo TMM chart' },
    { hex: pad, source: 'Paint Pad' },
    { hex: record.openHex, source: hexFrom ?? 'miniature-paints dataset' },
    { hex: record.wikiHex, source: 'Hobby-Paints-Wiki' },
  ].filter((s): s is { hex: string; source: string } => s.hex !== null && isHex(s.hex))
  const mine = override.hex && isHex(override.hex) ? { hex: override.hex.toUpperCase(), source: 'Yours' } : null
  const chosen = mine ?? sources[0] ?? null
  const references = sources.filter((s) => s !== chosen)
  const lab = chosen ? hexToLab(chosen.hex) : null
  return {
    ...record,
    owned,
    metal: mine ? null : metal,
    hex: chosen?.hex ?? null,
    hexSource: chosen?.source ?? 'none',
    references,
    gap: lab ? Math.max(0, ...references.map((r) => labDistance(hexToLab(r.hex), lab))) : 0,
    strength: override.strength ?? 1,
    hiding: override.hiding ?? 1,
    inMixer: (override.inMixer ?? record.normal) && chosen !== null,
    checked: override.checked ?? false,
  }
}

/** The built-in inventory with the given changes. */
export const buildPaints = (overrides: Record<string, PaintOverride>): Paint[] => STARTER.map((r) => buildPaint({ ...r, mine: overrides[r.code] ?? {} }))

export const isUsable = (p: Paint): p is UsablePaint => p.inMixer && p.hex !== null
