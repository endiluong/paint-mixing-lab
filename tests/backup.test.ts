import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backupName, countData, readBackup, writeBackup, type Backup, type UserData } from '@/lib/backup'
import { STARTER } from '@/lib/paints'
import type { StoredPaint } from '@/lib/types'

const custom: StoredPaint = { ...STARTER[0], id: 'my-1', origin: 'custom', code: '', name: 'Moss', brand: 'Homemade', openHex: '#4A6B2F', mine: { strength: 2 }, addedAt: '2026-11-25T10:00:00.000Z' }
const state = {
  'pml.mix': [{ code: '72.011', parts: 3 }, { code: 'my-1', parts: 1 }],
  'pml.layer': { base: '72.011', layers: [{ id: 'a', source: 'mix', opacity: 0.5 }] },
  'pml.saved': [{ id: 's', kind: 'mix', hex: '#112233', steps: ['#112233'], recipe: '3 + 1' }],
  'pml.recipes': [{ id: 'r', title: 'Cloak', author: '', source: 'https://example.com/r', steps: [{ kind: 'step', parts: ['Use ', { ref: '72.011' }] }], paints: [{ key: '72.011', name: 'Gory Red', code: '72.011', range: 'Vallejo', hex: null }], addedAt: '2026-11-25T10:00:00.000Z' }],
  'pml.wish': [{ title: 'x', brand: 'AK', code: 'AK1', name: 'X', hex: '#AABBCC', finish: 'normal', metal: null, origin: 'open' }],
  'pml.buy': 'AK1',
  'pml.buy.lines': ['AK1'],
  'pml.buy.choices': { AK1: { index: 1, hex: '#AABBCC' } },
  'pml.scope': 'all',
  'pml.view': '2d',
  'pml.surround': 'grey',
}
const data: UserData = { paints: [{ ...STARTER[1], mine: { hex: '#123456', checked: true }, addedAt: '2026-11-25T10:00:00.000Z' }, custom], state }
const now = new Date('2026-11-25T12:00:00.000Z')
const file = (patch: object): string => JSON.stringify({ app: 'paint-mixing-lab', version: 1, madeAt: now.toISOString(), paints: [], state: {}, ...patch })
const good = (text: string): Backup => {
  const r = readBackup(text)
  if ('error' in r) throw new Error(r.error)
  return r.backup
}

describe('backup file', () => {
  it('comes back exactly as it was saved', () => {
    const b = good(writeBackup(data, now))
    expect(b.paints).toEqual(data.paints)
    expect(b.state).toEqual(state)
    expect([b.skipped, b.madeAt]).toEqual([0, now.toISOString()])
    expect(countData(b).map((r) => r.count)).toEqual([2, 1, 1, 1])
  })
  it('keeps every built-in paint unchanged', () => {
    const paints = STARTER.map((p) => ({ ...p, addedAt: now.toISOString() }))
    expect(good(writeBackup({ paints, state: {} }, now)).paints).toEqual(paints)
  })
  it('is named after the day', () => {
    expect(backupName(new Date(2026, 0, 5))).toBe('paint-mixing-lab-backup-2026-01-05.json')
  })
  it('refuses other files and newer versions', () => {
    for (const bad of ['', 'code,name', '[]', '{}', 'null', file({ app: 'other' }), file({ paints: {} }), file({ state: [] })]) expect(readBackup(bad)).toHaveProperty('error')
    expect(readBackup(file({ version: 2 }))).toEqual({ error: expect.stringContaining('newer') })
  })
  it('accepts a byte order mark', () => {
    expect(good(String.fromCharCode(0xfeff) + file({})).paints).toEqual([])
  })
  it('leaves out and counts what it cannot read', () => {
    const b = good(file({ paints: [custom, custom, { ...custom, id: '' }, { ...custom, id: 'b', name: ' ' }, 5, null], state: { 'pml.saved': 'x', 'pml.view': '4d', 'pml.mix': [{ code: 'a', parts: 'b' }], seeded: 1, __proto__: 1 } }))
    expect(b.paints.map((p) => p.id)).toEqual(['my-1'])
    expect(b.skipped).toBe(8)
    expect(b.state).toEqual({ 'pml.saved': [], 'pml.mix': [] })
  })
  it('lets no address or script through colors and links', () => {
    const b = good(
      file({
        paints: [{ ...custom, origin: 'starter', id: '../x', openHex: 'url(https://x.test/a)', mine: { hex: 'red', strength: 900 } }],
        state: {
          'pml.saved': [{ ...state['pml.saved'][0], steps: ['url(x)'] }],
          'pml.recipes': [{ ...state['pml.recipes'][0], source: 'javascript:alert(1)' }],
          'pml.wish': [{ ...state['pml.wish'][0], metal: { code: '', name: '', role: '', body: '#111111', shadow: '#111111', highlight: '#111111', angle: 90, stops: ['#111111', 'url(x)'] } }],
        },
      }),
    )
    expect(b.paints[0]).toMatchObject({ origin: 'custom', openHex: null, mine: { strength: 4 } })
    expect(b.paints[0].mine.hex).toBeUndefined()
    expect(JSON.stringify(b.state)).not.toMatch(/url\(|javascript/)
  })
})

describe('database', () => {
  let old: Record<string, string> = {}
  beforeEach(() => {
    old = {}
    vi.stubGlobal('indexedDB', new IDBFactory())
    vi.stubGlobal('localStorage', { get length() { return Object.keys(old).length }, key: (i: number) => Object.keys(old)[i] ?? null, getItem: (k: string) => old[k] ?? null })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
  const fresh = async () => {
    vi.resetModules()
    return import('@/lib/db')
  }
  it('starts empty on a built page and stays empty', async () => {
    vi.stubEnv('DEV', false)
    expect(await (await fresh()).boot()).toEqual({ paints: [], kept: true })
    expect((await (await fresh()).boot()).paints).toEqual([])
  })
  it('keeps the paints of someone who changed them in an older version', async () => {
    vi.stubEnv('DEV', false)
    old['pml.overrides'] = JSON.stringify({ '72.011': { hex: '#123456' } })
    expect((await (await fresh()).boot()).paints).toHaveLength(193)
  })
  it('does not give a visitor the label photo or sources of the owner', async () => {
    vi.stubEnv('DEV', false)
    vi.resetModules()
    const { createPaint } = await import('@/lib/collection')
    const made = createPaint({ name: 'Gory Red', code: '72.011', brand: 'Vallejo', line: 'Game Color', type: 'Acrylic', group: 'Red', hex: '#8A0000', inMixer: true }, { id: '72.011', hex: '#8A0000', from: 'x', brand: 'Vallejo', code: '72.011', name: 'Gory Red' })
    expect(made).toMatchObject({ origin: 'catalog', seen: '', score: 0 })
  })
  it('replaces everything, keeps it after a reload, and can go back', async () => {
    const one = await fresh()
    const { paints } = await one.boot()
    one.setState('pml.view', '3d')
    one.setState('pml.buy', 'old')
    const before = await one.snapshot([])
    expect([before.paints.length, before.state]).toEqual([193, { 'pml.view': '3d', 'pml.buy': 'old' }])
    expect((await one.replaceAll({ paints: data.paints, state: { 'pml.view': '2d' } })).paints).toEqual(data.paints)
    expect([one.getState('pml.view', ''), one.getState('pml.buy', 'none')]).toEqual(['2d', 'none'])
    const two = await fresh()
    expect((await two.boot()).paints.map((p) => p.id).sort()).toEqual(data.paints.map((p) => p.id).sort())
    expect(two.getState('pml.buy', 'none')).toBe('none')
    await two.replaceAll(before)
    const three = await fresh()
    expect((await three.boot()).paints).toEqual(paints)
    expect(three.getState('pml.buy', '')).toBe('old')
  })
  it('changes nothing when the data cannot be stored', async () => {
    const one = await fresh()
    await one.boot()
    one.setState('pml.buy', 'old')
    const broken = [{ ...custom, id: undefined as unknown as string }]
    await expect(one.replaceAll({ paints: broken, state: {} })).rejects.toThrow()
    expect(one.getState('pml.buy', '')).toBe('old')
    expect((await one.snapshot([])).paints).toHaveLength(193)
  })
  it('also works when the browser blocks storage', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
    const db = await fresh()
    await db.boot()
    db.setState('pml.buy', 'x')
    expect(await db.snapshot([custom])).toEqual({ paints: [custom], state: { 'pml.buy': 'x' } })
    expect(await db.replaceAll({ paints: [], state: {} })).toEqual({ paints: [], kept: false })
    expect(db.getState('pml.buy', 'none')).toBe('none')
  })
})
