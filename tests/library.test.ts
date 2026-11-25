import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyFilter, brandChoice, EMPTY_FILTER } from '@/components/Filters'
import { checkPaint, finishOf, parseQuery } from '@/lib/buyCheck'
import { hexToLab, isHex, labDistance } from '@/lib/color'
import { toLibraryPaint } from '@/lib/library'
import { findMixes } from '@/lib/match'
import { buildPaints, isUsable, SQUIDMAR } from '@/lib/paints'

type Row = Parameters<typeof toLibraryPaint>[0]
const library = (JSON.parse(readFileSync('public/library.json', 'utf8')) as Row[]).map(toLibraryPaint)
const mine = buildPaints({}).filter(isUsable)
const all = [...mine, ...library]

describe('library', () => {
  it('has valid, unique paints that the user does not own', () => {
    expect(library.length).toBeGreaterThan(2000)
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length)
    expect(library.every((p) => isHex(p.hex) && p.name && !p.owned)).toBe(true)
    const owned = new Set(buildPaints({}).map((p) => `${p.brand}|${p.code}`))
    expect(library.some((p) => p.code && owned.has(`${p.brand}|${p.code}`))).toBe(false)
  })
  it('covers the requested brands and the Squidmar chart', () => {
    expect([...new Set(library.map((p) => p.brand))].sort()).toEqual(['AK Interactive', 'Citadel', 'Scale75', 'Vallejo'])
    expect(library.filter((p) => p.line === 'Squidmar Color')).toHaveLength(48)
  })
  it('only holds normal paints', () => {
    const odd = library.filter((p) => finishOf(p.line, p.name) !== 'normal')
    expect(odd.map((p) => `${p.line}: ${p.name}`)).toEqual([])
  })
  it('agrees with the official chart colour', () => {
    const charts = JSON.parse(readFileSync('data/vallejo-charts.json', 'utf8')) as Record<string, { hex: string }>
    const seen = library.filter((p) => p.brand === 'Vallejo' && charts[p.code])
    expect(seen.length).toBeGreaterThan(150)
    expect(seen.every((p) => labDistance(hexToLab(p.hex), hexToLab(charts[p.code].hex)) < 0.03)).toBe(true)
  })
  it('filters and sorts all paints quickly', () => {
    const start = performance.now()
    const red = applyFilter(all, { ...EMPTY_FILTER, group: 'Red', brands: ['Citadel'] })
    applyFilter(all, EMPTY_FILTER)
    expect(performance.now() - start).toBeLessThan(400)
    expect(red.length).toBeGreaterThan(3)
    expect(red.every((p) => p.brand === 'Citadel' && p.group === 'Red')).toBe(true)
  })
  it('splits Vallejo into three brand choices that lose no paint', () => {
    const everyone = [...buildPaints({}), ...library]
    const vallejo = everyone.filter((p) => p.brand === 'Vallejo')
    const count = (b: string) => applyFilter(everyone, { ...EMPTY_FILTER, brands: [b] }).length
    const parts = ['Vallejo GameColor', 'Vallejo Color', 'Vallejo Squidmar'].map(count)
    expect(parts.every((n) => n > 0)).toBe(true)
    expect(parts[0] + parts[1] + parts[2]).toBe(vallejo.length)
    expect(brandChoice({ brand: 'Vallejo', line: 'Model Color' })).toBe('Vallejo Color')
    expect(brandChoice({ brand: 'Vallejo', line: 'Xpress Color' })).toBe('Vallejo GameColor')
    expect(brandChoice({ brand: 'Vallejo', line: 'Squidmar Color' })).toBe('Vallejo Squidmar')
    expect(brandChoice({ brand: 'Citadel', line: 'Base' })).toBe('Citadel')
  })
  it('combines several brands and types', () => {
    const two = applyFilter(all, { ...EMPTY_FILTER, brands: ['Citadel', 'Scale75'] })
    expect(new Set(two.map((p) => p.brand))).toEqual(new Set(['Citadel', 'Scale75']))
    const only = (brand: string) => applyFilter(all, { ...EMPTY_FILTER, brands: [brand] }).length
    expect(two.length).toBe(only('Citadel') + only('Scale75'))
    const inventory = buildPaints({})
    const types = applyFilter(inventory, { ...EMPTY_FILTER, types: ['Ink', 'Fluo'], brands: ['Vallejo GameColor'] })
    expect(types.length).toBe(10)
    expect(types.every((p) => p.brand === 'Vallejo' && ['Ink', 'Fluo'].includes(p.type))).toBe(true)
  })
  it('matches across all paints without freezing', () => {
    const start = performance.now()
    expect(findMixes('#6B7A3A', all, 3)[0].distance).toBeLessThan(0.02)
    expect(performance.now() - start).toBeLessThan(3000)
  })
})

describe('Squidmar Color', () => {
  it('has the 72 colours of the chart in four finishes', () => {
    expect(SQUIDMAR).toHaveLength(72)
    const count = (f: string) => SQUIDMAR.filter((p) => finishOf(p.set, p.name) === f).length
    expect([count('normal'), count('metal'), count('fluo'), count('ink')]).toEqual([48, 7, 5, 12])
  })
  it('works in Buy check', () => {
    expect(parseQuery('Squidmar 74.208')).toMatchObject({ brand: 'Vallejo', code: '74.208' })
    const p = SQUIDMAR.find((x) => x.code === '74.208')
    const v = checkPaint({ title: 'x', brand: 'Vallejo', code: '74.208', name: p?.name ?? '', hex: p?.hex ?? '', finish: 'normal', origin: 'open' }, buildPaints({}))
    expect(v.kind).not.toBe('own')
    expect(v.neighbours[0].paint.group).toBe('Yellow')
  })
})
