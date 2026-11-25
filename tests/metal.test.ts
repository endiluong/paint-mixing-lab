import { describe, expect, it } from 'vitest'
import { checkPaint, finishOf, lookup, parseQuery, type Candidate, type RefPaint } from '@/lib/buyCheck'
import { hexToLab, isHex, labDistance, paintBackground } from '@/lib/color'
import { buildPaints, TMM } from '@/lib/paints'

const paints = buildPaints({})
const refs = TMM.map<RefPaint>((m) => ({ brand: 'Vallejo', name: `${m.name} ${m.role}`, code: m.code, set: 'True Metallic Metal', hex: m.body, metal: m }))
const candidate = (line: string): Candidate => {
  const { ref } = lookup(parseQuery(line), refs)[0]
  return { title: line, brand: ref.brand, code: ref.code, name: ref.name, hex: ref.hex, finish: finishOf(ref.set, ref.name), metal: ref.metal, origin: 'open' }
}

describe('metal chart', () => {
  it('has all 80 swatches with valid colours', () => {
    expect(TMM).toHaveLength(80)
    expect(TMM.every((m) => [m.body, m.highlight, m.shadow, ...m.stops].every(isHex) && m.stops.length === 17)).toBe(true)
  })
  it('matches the swatch the user photographed from the chart (77.167)', () => {
    const m = TMM.find((x) => x.code === '77.167')
    expect(m?.name).toBe('Crimson Magenta')
    expect(labDistance(hexToLab(m?.body ?? ''), hexToLab('#AC4483'))).toBeLessThan(0.04)
    expect(labDistance(hexToLab(m?.highlight ?? ''), hexToLab('#F3A6C4'))).toBeLessThan(0.05)
  })
  it('is the hex source of every owned metallic, unless the user sets one', () => {
    const metals = paints.filter((p) => p.type === 'Metal')
    expect(metals).toHaveLength(28)
    expect(metals.every((p) => p.hexSource === 'Vallejo TMM chart' && p.metal !== null)).toBe(true)
    const mine = buildPaints({ '77.101': { hex: '#112233' } }).find((p) => p.code === '77.101')
    expect(mine).toMatchObject({ hex: '#112233', metal: null })
  })
  it('draws a gradient for metallics and a flat colour otherwise', () => {
    expect(paintBackground('#111111', TMM[0])).toMatch(/^linear-gradient\(\d+deg, #/)
    expect(paintBackground('#111111', null)).toBe('#111111')
  })
})

describe('buying metallics', () => {
  it('knows an owned one', () => expect(checkPaint(candidate('77.101'), paints).kind).toBe('own'))
  it('sees that an airbrush version repeats the base version you own', () => {
    const v = checkPaint(candidate('77.165'), paints)
    expect(v.kind).toBe('duplicate')
    expect(v.neighbours[0].paint.code).toBe('77.125')
  })
  it('sees that magenta is new', () => {
    const v = checkPaint(candidate('77.167'), paints)
    expect(v.kind).toBe('gap')
    expect(v.neighbours.every((n) => n.paint.type === 'Metal')).toBe(true)
  })
})
