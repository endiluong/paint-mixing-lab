import { useMemo } from 'react'
import { chroma, hexToLab, hue } from '@/lib/color'
import type { Paint } from '@/lib/types'

export interface FilterState {
  q: string
  group: string
  type: string
  brand: string
  sort: 'hue' | 'light' | 'code' | 'name'
}

export const EMPTY_FILTER: FilterState = { q: '', group: '', type: '', brand: '', sort: 'hue' }

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
      (!f.group || p.group === f.group) &&
      (!f.type || p.type === f.type) &&
      (!f.brand || p.brand === f.brand) &&
      (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (bare !== '' && p.code.toLowerCase().replace(/[^a-z0-9]/g, '').includes(bare))),
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

export const Filters = ({ paints, value, onChange }: Props) => {
  const options = useMemo(
    () => ({ group: unique(paints.map((p) => p.group)), type: unique(paints.map((p) => p.type)), brand: unique(paints.map((p) => p.brand)) }),
    [paints],
  )
  const pick = (key: 'group' | 'type' | 'brand', label: string) => (
    <select aria-label={label} className="field min-w-0 flex-1" value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })}>
      <option value="">{label}</option>
      {options[key].map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
  const dirty = value.q || value.group || value.type || value.brand
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
        {pick('group', 'All color groups')}
        {pick('type', 'All types')}
        {pick('brand', 'All brands')}
        {dirty && <button type="button" className="btn" onClick={() => onChange({ ...EMPTY_FILTER, sort: value.sort })}>Clear</button>}
      </div>
    </div>
  )
}
