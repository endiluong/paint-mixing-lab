import spectral from 'spectral.js'
import type { MixPart } from './types'

/**
 * Kubelka-Munk paint model on 38-band reflectance curves rebuilt from each hex.
 * It is an estimate: one hex cannot carry a paint's real pigment data, so `strength`
 * (how strongly a paint tints a mix) and `hiding` (how well it covers) are adjustable per paint.
 */

const BANDS = 38
const MIN_R = 0.0003
const MAX_R = 0.999
/** Weights dark pigments between "equal light" and "equal volume", so 1:1 black+white is a dark grey and 1:9 a mid grey. */
const LUMINANCE_WEIGHT = 0.75

interface Curve {
  R: number[]
  KS: number[]
  weight: number
}

const cache = new Map<string, Curve>()
const clampR = (r: number): number => Math.min(MAX_R, Math.max(MIN_R, r))
const ks = (r: number): number => (1 - r) ** 2 / (2 * r)
const reflectance = (k: number): number => 1 + k - Math.sqrt(k * k + 2 * k)

export const curveOf = (hex: string): Curve => {
  const key = hex.toUpperCase()
  const hit = cache.get(key)
  if (hit) return hit
  const color = new spectral.Color(key)
  const R = color.R.map(clampR)
  const curve: Curve = { R, KS: R.map(ks), weight: Math.max(MIN_R, color.luminance) ** LUMINANCE_WEIGHT }
  cache.set(key, curve)
  return curve
}

export const mixCurve = (parts: MixPart[]): number[] => {
  const sum: number[] = new Array<number>(BANDS).fill(0)
  let total = 0
  for (const p of parts) {
    if (p.parts <= 0) continue
    const c = curveOf(p.hex)
    const w = p.parts * p.strength * c.weight
    total += w
    for (let i = 0; i < BANDS; i++) sum[i] += c.KS[i] * w
  }
  return sum.map((v) => clampR(reflectance(v / total)))
}

export const curveToHex = (R: number[]): string => new spectral.Color(R).toString()
export const curveToLab = (R: number[]): [number, number, number] => new spectral.Color(R).OKLab

/** Result of mixing wet paints. A single paint returns itself unchanged. */
export const mixHex = (parts: MixPart[]): string | null => {
  const used = parts.filter((p) => p.parts > 0)
  if (used.length === 0) return null
  if (used.length === 1) return used[0].hex.toUpperCase()
  return curveToHex(mixCurve(used))
}

/** Pigments scatter less where they absorb; without this a thin red over black would look grey. */
const SCATTER_FALLOFF = 0.8
const scatterCache = new WeakMap<number[], number[]>()
const scatterOf = (paint: number[]): number[] => {
  const hit = scatterCache.get(paint)
  if (hit) return hit
  const top = Math.max(...paint)
  const scatter = paint.map((r) => (r / top) ** SCATTER_FALLOFF)
  scatterCache.set(paint, scatter)
  return scatter
}

const filmOver = (surface: number[], paint: number[], thickness: number): number[] => {
  const scatter = scatterOf(paint)
  return paint.map((rInf, i) => {
    const rg = surface[i]
    const a = (1 / rInf + rInf) / 2
    const b = (1 / rInf - rInf) / 2
    const coth = 1 / Math.tanh(Math.max(1e-9, b * thickness * scatter[i]))
    return clampR((1 - rg * (a - b * coth)) / (a - rg + b * coth))
  })
}

const BLACK = new Array<number>(BANDS).fill(MIN_R)
const WHITE = new Array<number>(BANDS).fill(MAX_R)
const lightness = (R: number[]): number => curveToLab(R)[0]
const thicknessCache = new WeakMap<number[], Map<number, number>>()

/**
 * Film thickness for an opacity. Opacity means how much of the lightness difference between a black
 * and a white surface the coat hides, so 50% looks half covered for a dark red and for a yellow alike.
 */
const thicknessFor = (paint: number[], opacity: number): number => {
  const known = thicknessCache.get(paint) ?? new Map<number, number>()
  thicknessCache.set(paint, known)
  const key = Math.round(opacity * 1000)
  const hit = known.get(key)
  if (hit !== undefined) return hit
  const bare = lightness(WHITE) - lightness(BLACK)
  let low = 0
  let high = 1
  const hidden = (t: number): number => 1 - (lightness(filmOver(WHITE, paint, t)) - lightness(filmOver(BLACK, paint, t))) / bare
  while (hidden(high) < opacity && high < 4096) high *= 2
  for (let i = 0; i < 26; i++) {
    const mid = (low + high) / 2
    if (hidden(mid) < opacity) low = mid
    else high = mid
  }
  known.set(key, high)
  return high
}

/** One film of paint over a surface. Opacity 0 leaves the surface, 1 hides it completely. */
export const layerCurve = (surface: number[], paint: number[], opacity: number, hiding = 1): number[] => {
  if (opacity <= 0) return surface
  if (opacity >= 1) return paint
  return filmOver(surface, paint, thicknessFor(paint, opacity) * hiding)
}

export interface LayerInput {
  curve: number[]
  opacity: number
  hiding: number
}

/** Hex after the base and after every layer, in painting order. */
export const layerSteps = (baseHex: string, layers: LayerInput[]): string[] => {
  let surface = curveOf(baseHex).R
  const steps = [baseHex.toUpperCase()]
  for (const layer of layers) {
    surface = layerCurve(surface, layer.curve, layer.opacity, layer.hiding)
    steps.push(layer.opacity <= 0 ? steps[steps.length - 1] : curveToHex(surface))
  }
  return steps
}
