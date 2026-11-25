import { useMemo } from 'react'
import { chroma, hexToLab, hue } from '@/lib/color'
import type { Paint } from '@/lib/types'
import { MultiSelect, type MultiOption } from './MultiSelect'

export interface FilterState {
  q: string
  /** Empty means every color group. */
  groups: string[]
  /** Empty means every type. */
  types: string[]
  /** Empty means every brand. */
  brands: string[]
  sort: 'hue' | 'light' | 'code' | 'name'
}

/** Brand choices in the filter. Vallejo is split by range: the game family, Squidmar, and everything else. */
export const brandChoice = (p: Pick<Paint, 'brand' | 'line'>): string => {
  if (p.brand !== 'Vallejo') return p.brand
  if (/squidmar/i.test(p.line)) return 'Vallejo Squidmar'
  if (/^game |xpress/i.test(p.line)) return 'Vallejo GameColor'
  return 'Vallejo Color'
}

export const EMPTY_FILTER: FilterState = { q: '', groups: [], types: [], brands: [], sort: 'hue' }

const hueKey = (p: Paint): number => {
  if (!p.hex) return 9999
  const lab = hexToLab(p.hex)
  return chroma(lab) < 0.025 ? 1000 - lab.L : hue(lab)
}

export const applyFilter = <T extends Paint>(paints: T[], f: FilterState): T[] => {
  const q = f.q.trim().toLowerCase()
  const bare = q.replace(/[^a-z0-9]/g, '')
  const out = paints.filter(
    (p) =>
      (f.groups.length === 0 || f.groups.includes(p.group)) &&
      (f.types.length === 0 || f.types.includes(p.type)) &&
      (f.brands.length === 0 || f.brands.includes(brandChoice(p))) &&
      (!q || p.name.toLowerCase().includes(q) || p.line.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (bare !== '' && p.code.toLowerCase().replace(/[^a-z0-9]/g, '').includes(bare))),
  )
  const sorters: Record<FilterState['sort'], (a: T, b: T) => number> = {
    hue: (a, b) => hueKey(a) - hueKey(b),
    light: (a, b) => (b.hex ? hexToLab(b.hex).L : -1) - (a.hex ? hexToLab(a.hex).L : -1),
    code: (a, b) => a.code.localeCompare(b.code),
    name: (a, b) => a.name.localeCompare(b.name),
  }
  return out.sort(sorters[f.sort])
}

interface Props {
  paints: Paint[]
  value: FilterState
  onChange: (next: FilterState) => void
}

const unique = (values: string[]): string[] => [...new Set(values)].sort()

/** Counts follow the other filters, so a number is what ticking that box would show. Ticked values stay listed even at zero. */
const countBy = (paints: Paint[], every: string[], key: 'group' | 'type' | 'brand'): MultiOption[] => {
  const counts = new Map(every.map((v) => [v, 0]))
  for (const p of paints) {
    const value = key === 'brand' ? brandChoice(p) : p[key]
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return every.map((v) => ({ value: v, count: counts.get(v) ?? 0 }))
}

export const Filters = ({ paints, value, onChange }: Props) => {
  const options = useMemo(
    () => ({ group: unique(paints.map((p) => p.group)), type: unique(paints.map((p) => p.type)), brand: unique(paints.map(brandChoice)) }),
    [paints],
  )
  const groupOptions = useMemo(() => countBy(applyFilter(paints, { ...value, groups: [] }), options.group, 'group'), [paints, value, options])
  const typeOptions = useMemo(() => countBy(applyFilter(paints, { ...value, types: [] }), options.type, 'type'), [paints, value, options])
  const brandOptions = useMemo(() => countBy(applyFilter(paints, { ...value, brands: [] }), options.brand, 'brand'), [paints, value, options])
  const dirty = value.q !== '' || value.groups.length > 0 || value.types.length > 0 || value.brands.length > 0
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input className="field min-w-0 flex-1" aria-label="Search code or name" placeholder="Search code or name" value={value.q} onChange={(e) => onChange({ ...value, q: e.target.value })} />
        <select aria-label="Sort" className="field" value={value.sort} onChange={(e) => onChange({ ...value, sort: e.target.value as FilterState['sort'] })}>
          <option value="hue">By hue</option>
          <option value="light">By lightness</option>
          <option value="code">By code</option>
          <option value="name">By name</option>
        </select>
      </div>
      <div className="flex gap-2">
        <MultiSelect noun="color groups" align="left" options={groupOptions} value={value.groups} onChange={(groups) => onChange({ ...value, groups })} />
        <MultiSelect noun="types" options={typeOptions} value={value.types} onChange={(types) => onChange({ ...value, types })} />
        <MultiSelect noun="brands" options={brandOptions} value={value.brands} onChange={(brands) => onChange({ ...value, brands })} />
        {dirty && <button type="button" className="btn" onClick={() => onChange({ ...EMPTY_FILTER, sort: value.sort })}>Clear</button>}
      </div>
    </div>
  )
}
