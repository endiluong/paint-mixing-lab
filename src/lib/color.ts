export interface Lab {
  L: number
  a: number
  b: number
}

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

export const isHex = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value)

const computeLab = (hex: string): Lab => {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

const labCache = new Map<string, Lab>()

export const hexToLab = (hex: string): Lab => {
  const hit = labCache.get(hex)
  if (hit) return hit
  const lab = computeLab(hex)
  if (labCache.size > 20000) labCache.clear()
  labCache.set(hex, lab)
  return lab
}

export const labDistance = (p: Lab, q: Lab): number => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b)

export const chroma = (c: Lab): number => Math.hypot(c.a, c.b)

/** Hue angle in degrees, 0-360. */
export const hue = (c: Lab): number => ((Math.atan2(c.b, c.a) * 180) / Math.PI + 360) % 360

/** CSS background for a paint: a metallic sweep when there is one, otherwise the flat colour. */
export const paintBackground = (hex: string | null, metal: { angle: number; stops: string[] } | null | undefined): string =>
  metal ? `linear-gradient(${metal.angle}deg, ${metal.stops.join(', ')})` : (hex ?? 'repeating-linear-gradient(45deg,#555 0 5px,#666 5px 10px)')

/** Black or white text, whichever reads better on the colour. */
export const inkOn = (hex: string): string => (hexToLab(hex).L > 0.62 ? '#111111' : '#ffffff')

/** Plain words for a distance, so the number is not read as a promise. */
export const closeness = (distance: number): string => {
  if (distance < 0.02) return 'nearly identical'
  if (distance < 0.05) return 'very close'
  if (distance < 0.1) return 'similar'
  return 'different'
}

const MAX_CHROMA = 0.3

/** Point inside the unit sphere: height is lightness, angle is hue, distance from the axis is chroma. */
export const spherePosition = (c: Lab): [number, number, number] => {
  const y = c.L * 2 - 1
  const x = c.a / MAX_CHROMA
  const z = -c.b / MAX_CHROMA
  const length = Math.hypot(x, y, z)
  const k = length > 1 ? 1 / length : 1
  return [x * k, y * k, z * k]
}

/** Point in the unit disc for the 2D wheel. The power spreads out the crowded neutrals. */
export const wheelPosition = (c: Lab): [number, number] => {
  const ch = chroma(c)
  if (ch === 0) return [0, 0]
  const r = Math.min(1, (ch / MAX_CHROMA) ** 0.75)
  return [(c.a / ch) * r, (-c.b / ch) * r]
}
