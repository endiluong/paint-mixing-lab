import { describe, expect, it } from 'vitest'
import { hexToLab, labDistance } from '@/lib/color'
import { findMixes } from '@/lib/match'
import { buildPaints, isUsable } from '@/lib/paints'
import { findOwned, parseRecipePage, parseRecipeText, stepRatio } from '@/lib/recipe'

const paints = buildPaints({})

/** Made-up page in the same shape as a saved recipe page. */
const props = {
  recipeId: 7,
  recipeContent: {
    items: [
      { content: 'Stone', type: 'heading' },
      { content: 'Mix 2:1 :VallejoModelColor/IceYellow: and :Other/Moss:', type: 'step' },
      { content: 'Ratio time 12:30 is not a paint :Unknown/Thing:', type: 'step' },
    ],
  },
  paintCollection: {
    paintRanges: [{ id: 1, name: 'Vallejo Model Color' }, { id: 2, name: 'Other Range' }],
    paints: [
      { fullIdentifier: 'VallejoModelColor/IceYellow', manufacturerCode: '70.858', name: 'Ice Yellow', paintRangeId: 1, swatchStyle: { color: '#f7d897' } },
      { fullIdentifier: 'Other/Moss', manufacturerCode: '', name: 'Moss', paintRangeId: 2, swatchStyle: { color: 'url(javascript:1)' } },
    ],
  },
}
const attr = JSON.stringify(props).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const page = `<html><head><meta property="og:url" content="https://paintpad.app/recipes/7-x"><meta property="og:title" content="Rocks by Sam"></head><body><div data-recipe-page-props="${attr}"></div></body></html>`

describe('inventory data', () => {
  it('has 193 paints and 138 in the mixer', () => {
    expect(paints).toHaveLength(193)
    expect(paints.filter(isUsable)).toHaveLength(138)
  })
  it('keeps Xpress, metal, ink, fluo and intense paints out of the mixer', () => {
    const off = paints.filter((p) => /Xpress|Metal|Ink|Fluo|Quick Gen|Special FX/.test(p.type) || p.detail === 'Intense')
    expect(off.length).toBe(55)
    expect(off.some(isUsable)).toBe(false)
  })
  it('lets the user replace a hex and add a paint to the mixer', () => {
    const p = buildPaints({ AK11088: { hex: '#aa1122', inMixer: true } }).find((x) => x.code === 'AK11088')
    expect(p?.hex).toBe('#AA1122')
    expect(p && isUsable(p)).toBe(true)
  })
})

describe('recipe import', () => {
  const r = parseRecipePage(page)
  it('reads title, author, source and steps', () => {
    expect(r).toMatchObject({ title: 'Rocks', author: 'Sam', source: 'https://paintpad.app/recipes/7-x' })
    expect(r?.steps[0]).toEqual({ kind: 'heading', parts: ['Stone'] })
    expect(r?.steps[1].parts).toContainEqual({ ref: 'VallejoModelColor/IceYellow' })
  })
  it('ignores unsafe colours and unknown tokens', () => {
    expect(r?.paints[1].hex).toBeNull()
    expect(r?.steps[2].parts.every((p) => typeof p === 'string')).toBe(true)
  })
  it('knows which paints are owned', () => {
    expect(r && findOwned(r.paints[0], paints)?.code).toBe('70.858')
    expect(r && findOwned(r.paints[1], paints)).toBeNull()
  })
  it('reads ratios', () => expect(r && stepRatio(r.steps[1].parts)).toEqual([2, 1]))
  it('rejects pages that are not recipes', () => expect(parseRecipePage('<html></html>')).toBeNull())
  it('reads typed recipes and recognises codes and names', () => {
    const t = parseRecipeText('My red\nBase:\nBasecoat 72011 then Charcoal\nGlaze 72.111', paints)
    expect(t?.title).toBe('My red')
    expect(t?.steps[0].kind).toBe('heading')
    expect(t?.paints.map((p) => p.code).sort()).toEqual(['72.011', '72.111', '72.155'])
  })
})

describe('target match', () => {
  const pool = paints.filter(isUsable)
  it('finds a mix for an olive that is better than any bad guess, in reasonable time', () => {
    const start = performance.now()
    const best = findMixes('#6B7A3A', pool, 3)
    expect(performance.now() - start).toBeLessThan(6000)
    expect(best.length).toBeGreaterThan(0)
    expect(best[0].distance).toBeLessThan(0.05)
    expect(labDistance(hexToLab(best[0].hex), hexToLab('#6B7A3A'))).toBeLessThan(0.05)
    expect(best.every((b) => b.items.length <= 3)).toBe(true)
  })
})
