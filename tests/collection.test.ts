import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findOwnedCandidate, type RefPaint } from '@/lib/buyCheck'
import { buildCatalog, searchCatalog } from '@/lib/catalog'
import { createPaint, editPaint, findTwin, patchPaint, problemWith, resetPaint, toFields } from '@/lib/collection'
import { inkOn } from '@/lib/color'
import { guessGroup } from '@/lib/group'
import { notOwned, toLibraryPaint } from '@/lib/library'
import { buildPaint, buildPaints, STARTER } from '@/lib/paints'
import { findOwned, parseRecipeText } from '@/lib/recipe'
import type { PaintFields } from '@/lib/types'

const library = (JSON.parse(readFileSync('public/library.json', 'utf8')) as Parameters<typeof toLibraryPaint>[0][]).map(toLibraryPaint)
const refs = (JSON.parse(readFileSync('public/reference.json', 'utf8')) as [string, string, string, string, string][]).map<RefPaint>(([brand, name, code, set, hex]) => ({ brand, name, code, set, hex }))
const catalog = buildCatalog(refs, library)
const paints = buildPaints({})
const fields = (patch: Partial<PaintFields> = {}): PaintFields => ({ name: 'Moss', code: '', brand: 'Homemade', line: '', type: 'Acrylic', group: 'Green', hex: '#4a6b2f', inMixer: true, ...patch })

describe('database', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', new IDBFactory())
    vi.stubGlobal('localStorage', { get length() { return store.size }, key: (i: number) => [...store.keys()][i] ?? null, getItem: (k: string) => store.get(k) ?? null })
    store.clear()
  })
  const fresh = async () => {
    vi.resetModules()
    return import('@/lib/db')
  }
  const settle = () => new Promise((r) => setTimeout(r, 60))

  it('starts with the 193 built-in paints', async () => {
    const b = await (await fresh()).boot()
    expect(b.kept).toBe(true)
    expect(b.paints).toHaveLength(193)
    expect(new Set(b.paints.map((p) => p.id)).size).toBe(193)
  })
  it('brings over everything kept before IndexedDB', async () => {
    store.set('pml.overrides', JSON.stringify({ '72.011': { hex: '#123456', strength: 2 } }))
    store.set('pml.recipes', JSON.stringify([{ id: 'x' }]))
    store.set('pml.broken', '{')
    store.set('other', '1')
    const db = await fresh()
    const b = await db.boot()
    const changed = b.paints.filter((p) => Object.keys(p.mine).length > 0)
    expect(changed.map((p) => [p.id, p.mine])).toEqual([['72.011', { hex: '#123456', strength: 2 }]])
    expect(db.getState('pml.recipes', [])).toEqual([{ id: 'x' }])
    expect(db.getState('other', null)).toBe(null)
  })
  it('keeps changes after a reload and never brings removed paints back by itself', async () => {
    const one = await fresh()
    const { paints: all } = await one.boot()
    one.deletePaints([all[0].id, all[1].id])
    one.putPaints([createPaint(fields(), null), { ...all[2], mine: { strength: 3 } }])
    one.setState('pml.view', '2d')
    await settle()
    store.set('pml.view', JSON.stringify('3d'))
    const two = await fresh()
    const again = await two.boot()
    expect(again.paints).toHaveLength(192)
    expect(again.paints.some((p) => p.id === all[0].id)).toBe(false)
    expect(again.paints.find((p) => p.id === all[2].id)?.mine.strength).toBe(3)
    expect(again.paints.some((p) => p.name === 'Moss')).toBe(true)
    expect(two.getState('pml.view', '')).toBe('2d')
  })
  it('stays empty after removing everything', async () => {
    const one = await fresh()
    one.deletePaints([])
    const { paints: all } = await one.boot()
    one.deletePaints(all.map((p) => p.id))
    await settle()
    expect((await (await fresh()).boot()).paints).toEqual([])
  })
  it('fills only once when two tabs open together', async () => {
    const a = await fresh()
    const b = await fresh()
    const [x, y] = await Promise.all([a.boot(), b.boot()])
    expect([x.paints.length, y.paints.length]).toEqual([193, 193])
    expect(x.paints[0].addedAt).toBe(y.paints[0].addedAt)
  })
  it('still works, with a warning, when the browser blocks storage', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
    store.set('pml.view', JSON.stringify('2d'))
    const db = await fresh()
    const b = await db.boot()
    expect(b.kept).toBe(false)
    expect(b.paints).toHaveLength(193)
    expect(db.getState('pml.view', '3d')).toBe('2d')
    expect(() => db.putPaints([b.paints[0]])).not.toThrow()
  })
})

describe('create', () => {
  it('makes a paint from typed fields', () => {
    const p = buildPaint(createPaint(fields({ name: '  Moss ' }), null))
    expect(p).toMatchObject({ name: 'Moss', hex: '#4A6B2F', hexSource: 'Yours', owned: true, inMixer: true, references: [] })
  })
  it('keeps a metallic out of the mixer unless asked', () => {
    expect(buildPaint(createPaint(fields({ type: 'Metal', inMixer: false }), null)).inMixer).toBe(false)
    expect(buildPaint(createPaint(fields({ type: 'Metal', inMixer: true }), null)).inMixer).toBe(true)
  })
  it('keeps the id of a library paint, so saved mixes still find it', () => {
    const p = library.find((x) => x.code === '74.208')
    if (!p) throw new Error('missing')
    const hit = catalog.find((c) => c.fields.code === '74.208')
    const made = createPaint(toFields(p), hit?.source ?? null)
    expect(made.id).toBe(p.id)
    expect(buildPaint(made)).toMatchObject({ hex: p.hex, hexSource: p.hexSource, group: p.group })
    expect(notOwned(library, [...paints, buildPaint(made)]).some((x) => x.id === p.id)).toBe(false)
  })
  it('brings a removed built-in paint back with its sources', () => {
    const s = STARTER.find((x) => x.wikiHex && x.openHex && x.normal) ?? STARTER[0]
    const p = buildPaint(s)
    expect(createPaint(toFields(p), null)).toMatchObject({ id: s.id, origin: 'starter', wikiHex: s.wikiHex })
    const hit = catalog.find((c) => c.source.id === s.id)
    expect(buildPaint(createPaint(hit?.fields ?? fields(), hit?.source ?? null)).hexSource).toBe(p.hexSource)
  })
  it('refuses incomplete paints and duplicates in plain words', () => {
    expect(problemWith(fields(), paints, null)).toBe(null)
    expect(problemWith(fields({ name: ' ' }), paints, null)).toMatch(/name/)
    expect(problemWith(fields({ brand: '' }), paints, null)).toMatch(/brand/)
    expect(problemWith(fields({ group: '' }), paints, null)).toMatch(/group/)
    expect(problemWith(fields({ hex: '#12' }), paints, null)).toMatch(/hex/)
    expect(problemWith(fields({ brand: 'vallejo', code: '72011' }), paints, null)).toBe('You already have Vallejo Gory Red 72.011.')
    expect(problemWith(fields({ brand: 'Citadel', code: '72.011' }), paints, null)).toBe(null)
    const mine = [buildPaint(createPaint(fields(), null))]
    expect(findTwin(fields({ name: 'moss' }), mine, null)?.name).toBe('Moss')
    expect(findTwin(fields(), mine, mine[0].id)).toBe(null)
  })
})

describe('edit', () => {
  const s = STARTER.find((x) => x.code === '72.011') ?? STARTER[0]
  const shown = buildPaint(s)
  it('changes the label data without claiming an unchanged hex as the user’s', () => {
    const e = editPaint(s, { ...toFields(shown), name: 'Gory', group: 'Brown' }, shown.hex)
    expect(e).toMatchObject({ id: '72.011', name: 'Gory', group: 'Brown' })
    expect(e.mine.hex).toBeUndefined()
    expect(buildPaint(e).hexSource).toBe(shown.hexSource)
  })
  it('stores a changed hex as the user’s and can go back', () => {
    const e = editPaint(s, { ...toFields(shown), hex: '#aa0011' }, shown.hex)
    expect(buildPaint(e)).toMatchObject({ hex: '#AA0011', hexSource: 'Yours' })
    expect(buildPaint(resetPaint(e))).toEqual({ ...shown })
  })
  it('replaces the hex of a typed paint, and a reset does not lose it', () => {
    const c = patchPaint(createPaint(fields(), null), { hex: '#111111', strength: 2 })
    expect(buildPaint(c)).toMatchObject({ hex: '#111111', references: [] })
    expect(buildPaint(resetPaint(c))).toMatchObject({ hex: '#111111', strength: 1 })
  })
  it('follows the type for the mixer', () => {
    const c = createPaint(fields(), null)
    expect(buildPaint(editPaint(c, fields({ type: 'Ink', inMixer: false }), '#4A6B2F')).inMixer).toBe(false)
  })
  it('keeps the mixer choice of a paint without a hex', () => {
    const none = STARTER.find((x) => x.normal) ?? STARTER[0]
    const bare = { ...none, openHex: null, wikiHex: null, code: 'zzz' }
    const e = editPaint(bare, { ...toFields(buildPaint(bare)), name: 'x' }, null)
    expect(buildPaint({ ...e, openHex: '#123456' }).inMixer).toBe(true)
  })
})

describe('remove', () => {
  it('offers removed normal paints again under All paints', () => {
    const left = paints.filter((p) => p.code !== '72.011')
    const back = notOwned(library, left).filter((p) => p.code === '72.011')
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ id: '72.011', owned: false })
    expect(notOwned(library, paints)).toHaveLength(library.length)
  })
  it('does not offer paints of other finishes there', () => {
    expect(notOwned([], []).every((p) => p.normal)).toBe(true)
  })
})

describe('catalog', () => {
  it('finds by code, with or without the dot, and by words in any order', () => {
    expect(searchCatalog('72.011', catalog)[0].fields.name).toBe('Gory Red')
    expect(searchCatalog('72011', catalog)[0].fields.name).toBe('Gory Red')
    expect(searchCatalog('mephiston citadel', catalog)[0].fields).toMatchObject({ brand: 'Citadel', group: 'Red' })
    expect(searchCatalog('  ', catalog)).toEqual([])
  })
  it('lists every paint once and gives each a complete form', () => {
    expect(catalog.length).toBeGreaterThan(8000)
    const bad = catalog.filter((c) => c.fields.name !== '' && problemWith(c.fields, [], null) !== null && !STARTER.some((s) => s.id === c.source.id))
    expect(bad.slice(0, 5).map((c) => [c.fields, problemWith(c.fields, [], null)])).toEqual([])
    expect(catalog.filter((c) => c.source.id === '72.011')).toHaveLength(1)
  })
  it('marks every built-in paint as owned', () => {
    const mine = catalog.filter((c) => STARTER.some((s) => s.id === c.source.id))
    expect(mine).toHaveLength(193)
    expect(mine.every((c) => findTwin(c.fields, paints, null))).toBe(true)
  })
  it('guesses the color group', () => {
    expect(guessGroup('Dark Flesh', null)).toBe('Skin / Flesh')
    expect(guessGroup('Nameless', '#2040C0')).toBe('Blue')
    expect(guessGroup('Nameless', null)).toBe(null)
  })
})

describe('paints without a code', () => {
  const moss = buildPaint(createPaint(fields({ name: 'Swamp Moss' }), null))
  it('are recognised in recipes by name only', () => {
    const r = parseRecipeText('Cloak\nBase Swamp Moss then Gory Red', [...paints, moss])
    expect(r?.paints.map((p) => p.key).sort()).toEqual(['72.011', moss.id].sort())
    expect(findOwned({ key: 'x', name: 'Swamp Moss', code: '', range: 'Homemade', hex: null }, [moss])?.id).toBe(moss.id)
  })
  it('are recognised by Buy check', () => {
    expect(findOwnedCandidate({ brand: 'Homemade', code: '', name: 'swamp moss' }, [...paints, moss])?.id).toBe(moss.id)
    expect(findOwnedCandidate({ brand: '', code: '', name: 'swamp moss' }, [...paints, moss])).toBe(null)
  })
})

describe('pill text', () => {
  it('has at least 4.5 to 1 contrast on every paint', () => {
    const lum = (hex: string): number => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
    const ratio = (a: string, b: string): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
    expect(Math.min(...[...paints, ...library].flatMap((p) => (p.hex ? [ratio(p.hex, inkOn(p.hex))] : [])))).toBeGreaterThanOrEqual(4.5)
  })
})
