import openData from '@/data/paints.json'
import squidmarData from '@/data/squidmar.json'
import tmmData from '@/data/tmm.json'
import { hexToLab, isHex, labDistance } from './color'
import type { MetalSwatch, Paint, PaintOverride, PaintRecord, UsablePaint } from './types'

/** Optional file: without it every paint falls back to the open dataset. */
const padFiles = import.meta.glob<Record<string, string>>('@/data/paintpad-hex.json', { eager: true, import: 'default' })
const padHex: Record<string, string> = Object.values(padFiles)[0] ?? {}

export const TMM = tmmData as MetalSwatch[]
export const SQUIDMAR = squidmarData as { code: string; name: string; set: string; hex: string; metal: MetalSwatch | null }[]
const tmmByCode = new Map(TMM.map((m) => [m.code, m]))

export const RECORDS = openData as PaintRecord[]

const build = (record: PaintRecord, override: PaintOverride): Paint => {
  const metal = tmmByCode.get(record.code) ?? null
  const sources = [
    { hex: metal?.body ?? null, source: 'Vallejo TMM chart' },
    { hex: padHex[record.code] ?? null, source: 'Paint Pad' },
    { hex: record.openHex, source: 'miniature-paints dataset' },
    { hex: record.wikiHex, source: 'Hobby-Paints-Wiki' },
  ].filter((s): s is { hex: string; source: string } => s.hex !== null && isHex(s.hex))
  const mine = override.hex && isHex(override.hex) ? { hex: override.hex.toUpperCase(), source: 'Yours' } : null
  const chosen = mine ?? sources[0] ?? null
  const references = sources.filter((s) => s !== chosen)
  const lab = chosen ? hexToLab(chosen.hex) : null
  return {
    ...record,
    id: record.code,
    owned: true,
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

export const buildPaints = (overrides: Record<string, PaintOverride>): Paint[] => RECORDS.map((r) => build(r, overrides[r.code] ?? {}))

export const isUsable = (p: Paint): p is UsablePaint => p.inMixer && p.hex !== null
