import openData from '@/data/paints.json'
import { hexToLab, isHex, labDistance } from './color'
import type { Paint, PaintOverride, PaintRecord, UsablePaint } from './types'

/** Optional file: without it every paint falls back to the open dataset. */
const padFiles = import.meta.glob<Record<string, string>>('@/data/paintpad-hex.json', { eager: true, import: 'default' })
const padHex: Record<string, string> = Object.values(padFiles)[0] ?? {}

export const RECORDS = openData as PaintRecord[]

const build = (record: PaintRecord, override: PaintOverride): Paint => {
  const sources = [
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
