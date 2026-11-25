import { describe, expect, it } from 'vitest'
import { chroma, hexToLab, hue, labDistance, spherePosition } from '@/lib/color'
import { curveOf, curveToHex, layerSteps, mixHex } from '@/lib/paintModel'

const p = (hex: string, parts = 1, strength = 1) => ({ hex, parts, strength })
const L = (hex: string | null): number => hexToLab(hex ?? '#000000').L
const layer = (hex: string, opacity: number, hiding = 1) => ({ curve: curveOf(hex).R, opacity, hiding })

describe('mixing', () => {
  it('keeps a single paint unchanged', () => expect(mixHex([p('#E64C2A')])).toBe('#E64C2A'))

  it('rebuilds a hex from its own curve', () => {
    for (const h of ['#E64C2A', '#1D548A', '#FEE300', '#2B6C28', '#CCCCCC']) {
      expect(labDistance(hexToLab(curveToHex(curveOf(h).R)), hexToLab(h))).toBeLessThan(0.02)
    }
  })

  it('makes green from yellow and blue, not grey', () => {
    const lab = hexToLab(mixHex([p('#FEE300', 2), p('#1A76B5', 1)]) ?? '')
    expect(hue(lab)).toBeGreaterThan(115)
    expect(hue(lab)).toBeLessThan(185)
    expect(chroma(lab)).toBeGreaterThan(0.06)
  })

  it('makes orange from yellow and red', () => {
    const h = hue(hexToLab(mixHex([p('#FEE300', 3), p('#D53036', 1)]) ?? ''))
    expect(h).toBeGreaterThan(30)
    expect(h).toBeLessThan(85)
  })

  it('darkens white step by step with more black', () => {
    const steps = [9, 4, 1].map((w) => L(mixHex([p('#FFFFFF', w), p('#010101', 1)])))
    expect(steps[0]).toBeGreaterThan(steps[1])
    expect(steps[1]).toBeGreaterThan(steps[2])
    expect(steps[0]).toBeGreaterThan(0.55)
    expect(steps[0]).toBeLessThan(0.85)
    expect(steps[2]).toBeLessThan(0.55)
  })

  it('does not depend on the order of paints', () => {
    expect(mixHex([p('#FEE300', 2), p('#D53036')])).toBe(mixHex([p('#D53036'), p('#FEE300', 2)]))
  })

  it('depends on ratios, not totals', () => {
    expect(mixHex([p('#FEE300', 1), p('#D53036', 1)])).toBe(mixHex([p('#FEE300', 5), p('#D53036', 5)]))
  })

  it('handles three and four paints', () => {
    expect(mixHex([p('#FEE300'), p('#D53036'), p('#1A76B5')])).toMatch(/^#[0-9A-F]{6}$/)
    expect(mixHex([p('#FEE300'), p('#D53036'), p('#1A76B5'), p('#FFFFFF')])).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('lets strength pull the mix toward a paint', () => {
    const red = hexToLab('#D53036')
    const weak = labDistance(hexToLab(mixHex([p('#FFFFFF'), p('#D53036', 1, 1)]) ?? ''), red)
    const strong = labDistance(hexToLab(mixHex([p('#FFFFFF'), p('#D53036', 1, 3)]) ?? ''), red)
    expect(strong).toBeLessThan(weak)
  })

  it('returns null with nothing in the mix', () => expect(mixHex([p('#FFFFFF', 0)])).toBeNull())
})

describe('layering', () => {
  it('0% shows the base, 100% hides it', () => {
    expect(layerSteps('#010101', [layer('#D53036', 0)])[1]).toBe('#010101')
    expect(labDistance(hexToLab(layerSteps('#010101', [layer('#D53036', 1)])[1]), hexToLab('#D53036'))).toBeLessThan(0.02)
  })

  it('red over black gets lighter with opacity and stays red', () => {
    const s = [0.2, 0.4, 0.6, 0.8].map((o) => layerSteps('#010101', [layer('#D53036', o)])[1])
    for (let i = 1; i < s.length; i++) expect(L(s[i])).toBeGreaterThan(L(s[i - 1]))
    const h = hue(hexToLab(s[2]))
    expect(h < 45 || h > 340).toBe(true)
  })

  it('the same red looks brighter over white than over black', () => {
    expect(L(layerSteps('#FFFFFF', [layer('#D53036', 0.4)])[1])).toBeGreaterThan(L(layerSteps('#010101', [layer('#D53036', 0.4)])[1]))
  })

  it('two thin coats cover more than one', () => {
    const one = layerSteps('#010101', [layer('#FEE300', 0.4)])
    const two = layerSteps('#010101', [layer('#FEE300', 0.4), layer('#FEE300', 0.4)])
    expect(L(two[2])).toBeGreaterThan(L(one[1]))
  })

  it('more hiding covers more', () => {
    expect(L(layerSteps('#010101', [layer('#FEE300', 0.4, 2)])[1])).toBeGreaterThan(L(layerSteps('#010101', [layer('#FEE300', 0.4, 1)])[1]))
  })
})

describe('opacity scale', () => {
  it('hides half of the black and white contrast at 50%', () => {
    for (const h of ['#93262C', '#FEE300', '#FFFFFF', '#1D548A', '#E64C2A']) {
      const overWhite = L(layerSteps('#FFFFFF', [layer(h, 0.5)])[1])
      const overBlack = L(layerSteps('#000000', [layer(h, 0.5)])[1])
      expect(overWhite - overBlack).toBeGreaterThan(0.42)
      expect(overWhite - overBlack).toBeLessThan(0.58)
    }
  })
})

describe('thin coats', () => {
  it('keep their colour over black instead of going grey', () => {
    const thin = hexToLab(layerSteps('#010101', [layer('#D53036', 0.5)])[1])
    expect(chroma(thin)).toBeGreaterThan(0.08)
    expect(hue(thin) < 50 || hue(thin) > 340).toBe(true)
  })
})

describe('sphere', () => {
  it('keeps every colour inside the sphere with white on top', () => {
    for (const h of ['#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#ECFF56']) {
      expect(Math.hypot(...spherePosition(hexToLab(h)))).toBeLessThanOrEqual(1.0001)
    }
    expect(spherePosition(hexToLab('#FFFFFF'))[1]).toBeCloseTo(1, 2)
  })
})
