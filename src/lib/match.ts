import { chroma, hexToLab, labDistance, type Lab } from './color'
import { curveToHex, curveToLab, mixCurve } from './paintModel'
import type { UsablePaint } from './types'

export interface RecipeItem {
  paint: UsablePaint
  parts: number
}

export interface Recipe {
  items: RecipeItem[]
  hex: string
  distance: number
}

interface Scored {
  items: RecipeItem[]
  R: number[]
  distance: number
}

const RATIOS: [number, number][] = [[9, 1], [4, 1], [3, 1], [2, 1], [1, 1], [1, 2], [1, 3], [1, 4], [1, 9]]
const THIRD = [1, 2, 4]

const score = (items: RecipeItem[], target: Lab): Scored => {
  const R = mixCurve(items.map(({ paint, parts }) => ({ hex: paint.hex, parts, strength: paint.strength })))
  const [L, a, b] = curveToLab(R)
  return { items, R, distance: labDistance({ L, a, b }, target) }
}

const byDistance = (p: { distance: number }, q: { distance: number }): number => p.distance - q.distance

export const closestPaints = <T extends { hex: string }>(target: string, paints: T[], count = 5): { paint: T; distance: number }[] => {
  const lab = hexToLab(target)
  return paints
    .map((paint) => ({ paint, distance: labDistance(hexToLab(paint.hex), lab) }))
    .sort(byDistance)
    .slice(0, count)
}

/** Paints worth trying for a target: the nearest ones plus the lightest, darkest and most vivid. */
const shortlist = (target: string, paints: UsablePaint[], size: number): UsablePaint[] => {
  const near = closestPaints(target, paints, size).map((x) => x.paint)
  const labs = paints.map((paint) => ({ paint, lab: hexToLab(paint.hex) }))
  const byL = [...labs].sort((p, q) => p.lab.L - q.lab.L)
  const vivid = [...labs].sort((p, q) => chroma(q.lab) - chroma(p.lab)).slice(0, 18)
  const extra = [byL[0], byL[byL.length - 1], ...vivid].filter(Boolean).map((x) => x.paint)
  return [...new Set([...near, ...extra])]
}

/** Best mixes of up to `maxPaints` owned paints for a target colour. */
export const findMixes = (target: string, paints: UsablePaint[], maxPaints: 2 | 3, count = 6): Recipe[] => {
  const lab = hexToLab(target)
  const pool = shortlist(target, paints, 44)
  const found: Scored[] = []
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const options = RATIOS.map(([a, b]) => score([{ paint: pool[i], parts: a }, { paint: pool[j], parts: b }], lab))
      found.push(options.sort(byDistance)[0])
    }
  }
  found.sort(byDistance)
  if (maxPaints === 3) {
    const three: Scored[] = []
    for (const base of found.slice(0, 24)) {
      for (const paint of pool) {
        if (base.items.some((x) => x.paint.id === paint.id)) continue
        for (const extra of THIRD) three.push(score([...base.items.map((x) => ({ ...x, parts: x.parts * 2 })), { paint, parts: extra }], lab))
      }
    }
    found.push(...three)
    found.sort(byDistance)
  }
  const seen = new Set<string>()
  const out: Recipe[] = []
  for (const f of found) {
    const key = f.items.map((x) => x.paint.id).sort().join('+')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ items: f.items, hex: curveToHex(f.R), distance: f.distance })
    if (out.length >= count) break
  }
  return out
}
