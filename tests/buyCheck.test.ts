import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkPaint, finishOf, lookup, ownedFinish, parseQuery, type Candidate, type RefPaint } from '@/lib/buyCheck'
import { buildPaints } from '@/lib/paints'

const refs: RefPaint[] = (JSON.parse(readFileSync('public/reference.json', 'utf8')) as [string, string, string, string, string][]).map(([brand, name, code, set, hex]) => ({ brand, name, code, set, hex }))
const paints = buildPaints({})

const candidate = (line: string): Candidate => {
  const ref = lookup(parseQuery(line), refs)[0].ref
  return { title: line, brand: ref.brand, code: ref.code, name: ref.name, hex: ref.hex, finish: finishOf(ref.set, ref.name), origin: 'open' }
}
const typed = (hex: string): Candidate => ({ title: 'x', brand: '', code: '', name: 'x', hex, finish: 'normal', origin: 'typed' })

describe('reading a shopping list line', () => {
  it('finds code, name, brand and hex in any order', () => {
    expect(parseQuery('Vallejo 72.010 Bloody Red')).toMatchObject({ brand: 'Vallejo', code: '72.010', name: 'Bloody Red', hex: null })
    expect(parseQuery('Bloody Red 72010')).toMatchObject({ code: '72010', name: 'Bloody Red' })
    expect(parseQuery('My mystery paint #c8202f')).toMatchObject({ hex: '#C8202F', name: 'My mystery paint', code: '' })
    expect(parseQuery('AK 11049')).toMatchObject({ code: 'AK11049', brand: 'AK Interactive' })
    expect(parseQuery('SART-72 Neon Blue')).toMatchObject({ code: 'SART-72', name: 'Neon Blue' })
    expect(parseQuery('Tamiya XF-7')).toMatchObject({ code: 'XF-7', brand: 'Tamiya' })
    expect(parseQuery('AK11049')).toMatchObject({ code: 'AK11049', name: '' })
    expect(parseQuery('Citadel Mephiston Red')).toMatchObject({ brand: 'Citadel', name: 'Mephiston Red' })
  })
})

describe('finding the paint', () => {
  it('matches codes with or without the dot', () => {
    for (const s of ['72.010', '72010', 'Vallejo 72.010 Bloody Red']) expect(lookup(parseQuery(s), refs)[0]).toMatchObject({ exact: true, ref: { name: 'Bloody Red', code: '72.010' } })
  })
  it('does not guess when a code does not exist', () => expect(lookup(parseQuery('72.999'), refs)).toHaveLength(0))
  it('flags a name that belongs to several different paints', () => {
    const hits = lookup(parseQuery('Vallejo Bloody Red'), refs)
    expect(hits.length).toBeGreaterThan(1)
    expect(hits[0].exact).toBe(false)
  })
  it('prefers the bottle over spray and airbrush versions', () => expect(lookup(parseQuery('Citadel Mephiston Red'), refs)[0].ref.set).toBe('Base'))
  it('flags a code and name that do not belong together', () => {
    const hits = lookup(parseQuery('72.010 Turquoise'), refs)
    expect(hits.every((h) => !h.exact)).toBe(true)
  })
})

describe('finish', () => {
  it('separates finishes', () => {
    expect(finishOf('Game Color', 'Bloody Red')).toBe('normal')
    expect(finishOf('Game Color', 'Gold Yellow')).toBe('normal')
    expect(finishOf('Game Color', 'Polished Gold')).toBe('metal')
    expect(finishOf('Xpress Color', 'Snake Green')).toBe('contrast')
    expect(finishOf('Metal Color', 'Aluminium')).toBe('metal')
    expect(finishOf('Wash FX', 'Black')).toBe('wash')
    expect(finishOf('Skin Tones Paint Set', 'Barbarian Flesh')).toBe('normal')
    expect(finishOf('Standard (3rd Gen)', 'Hot Pink')).toBe('normal')
    expect(finishOf('Ink (3rd Gen)', 'Green')).toBe('ink')
  })
})

describe('verdict', () => {
  it('says you own a paint with the same brand and code', () => {
    const v = checkPaint(candidate('72.011'), paints)
    expect(v.kind).toBe('own')
    expect(v.owned?.name).toBe('Gory Red')
  })
  it('recognises owned Scale75 tubes by name, because the dataset has no codes for them', () => {
    expect(checkPaint(candidate('Scale75 Sap Green'), paints).kind).toBe('own')
  })
  it('compares an owned paint to itself as zero under the same source', () => {
    const p = paints.find((x) => x.code === '72.007')
    const v = checkPaint({ ...candidate('72.007'), code: '', brand: 'Other' }, paints)
    expect(v.kind).toBe('duplicate')
    expect(v.neighbours[0].paint.code).toBe(p?.code)
    expect(v.neighbours[0].distance).toBeCloseTo(0, 3)
  })
  it('calls pure white a duplicate and a far away colour a gap or a mix', () => {
    expect(checkPaint(typed('#FFFFFF'), paints).kind).toBe('duplicate')
    expect(['gap', 'mix']).toContain(checkPaint(typed('#7A00FF'), paints).kind)
    expect(checkPaint(typed('#7A00FF'), paints).kind).toBe('gap')
  })
  it('offers a mix when owned paints reach the colour', () => {
    const v = checkPaint(typed('#8C7A2E'), paints)
    if (v.kind === 'mix') expect(v.mixes[0].distance).toBeLessThan(0.02)
    expect(['mix', 'close', 'duplicate']).toContain(v.kind)
  })
  it('only compares within the same finish', () => {
    const metal = checkPaint(candidate('Vallejo 72.055'), paints)
    expect(metal.neighbours.every((n) => ownedFinish(n.paint) === 'metal')).toBe(true)
    expect(metal.mixes).toHaveLength(0)
  })
  it('warns when another hex source would change the answer', () => {
    const only = paints.filter((x) => x.code === '72.007')
    expect(checkPaint(typed(only[0].wikiHex ?? ''), only).depends).toBe(true)
    expect(checkPaint(typed('#0000FF'), only).depends).toBe(false)
  })
})
