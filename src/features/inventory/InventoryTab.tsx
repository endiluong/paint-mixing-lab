import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { applyFilter, EMPTY_FILTER, Filters, type FilterState } from '@/components/Filters'
import { isHex } from '@/lib/color'
import type { Paint, PaintOverride } from '@/lib/types'

interface Props {
  paints: Paint[]
  change: (code: string, patch: PaintOverride) => void
  reset: (code: string) => void
}

/** OKLab distance above which two references for one paint are worth a look. */
const GAP_WARNING = 0.08

const HexInput = ({ paint, onChange }: { paint: Paint; onChange: (hex: string | undefined) => void }) => {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="field w-24 tnum"
      aria-label={`Hex of ${paint.name} ${paint.code}`}
      value={draft ?? paint.hex ?? ''}
      placeholder="no hex"
      onFocus={() => setDraft(paint.hex ?? '')}
      onChange={(e) => {
        const v = e.target.value && !e.target.value.startsWith('#') ? `#${e.target.value}` : e.target.value
        setDraft(v)
        if (isHex(v) && v.toUpperCase() !== paint.hex) onChange(v.toUpperCase())
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

const csv = (paints: Paint[]): string => {
  const cell = (v: string | number | boolean | null): string => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['Code', 'Name', 'Brand', 'Line', 'Type', 'Detail', 'Color group', 'Hex', 'Hex source', 'In mixer', 'Strength', 'Hiding', 'Checked', 'Seen in photo']
  return [head, ...paints.map((p) => [p.code, p.name, p.brand, p.line, p.type, p.detail, p.group, p.hex, p.hexSource, p.inMixer, p.strength, p.hiding, p.checked, p.seen])].map((r) => r.map(cell).join(',')).join('\r\n')
}

export const InventoryTab = ({ paints, change, reset }: Props) => {
  const [filter, setFilter] = useState<FilterState>({ ...EMPTY_FILTER, sort: 'code' })
  const [only, setOnly] = useState<'all' | 'unchecked' | 'gap' | 'nohex' | 'off'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const shown = useMemo(
    () =>
      applyFilter(paints, filter).filter((p) => {
        if (only === 'unchecked') return !p.checked
        if (only === 'gap') return p.gap >= GAP_WARNING && p.hexSource !== 'Yours'
        if (only === 'nohex') return !p.hex
        if (only === 'off') return !p.inMixer
        return true
      }),
    [paints, filter, only],
  )
  const checked = paints.filter((p) => p.checked).length
  const download = (): void => {
    const url = URL.createObjectURL(new Blob(['﻿', csv(shown)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'paint-inventory.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-0 flex-col lg:h-full">
      <div className="grid gap-3 border-b border-line p-4 lg:grid-cols-[minmax(0,560px)_1fr]">
        <Filters paints={paints} value={filter} onChange={setFilter} />
        <div className="flex flex-wrap items-start gap-3">
          <select className="field" aria-label="Show" value={only} onChange={(e) => setOnly(e.target.value as typeof only)}>
            <option value="all">Every paint</option>
            <option value="unchecked">Not checked yet</option>
            <option value="gap">Hex sources disagree</option>
            <option value="nohex">No hex</option>
            <option value="off">Not in the mixer</option>
          </select>
          <button type="button" className="btn" onClick={download}><Download size={15} />Export CSV</button>
          <p className="py-1.5 text-sm text-dim tnum">{shown.length} of {paints.length} shown, {checked} checked</p>
        </div>
      </div>
      <div className="scroll min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-panel text-left text-dim">
            <tr>
              {['', 'Code', 'Name', 'Hex', 'Hex source', 'Brand', 'Line', 'Type', 'Color group', 'In mixer', 'Checked', ''].map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <Row key={p.code} paint={p} open={open === p.code} toggle={() => setOpen(open === p.code ? null : p.code)} change={(patch) => change(p.code, patch)} reset={() => reset(p.code)} />
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="p-6 text-dim">No paint matches. Clear the filters to see all {paints.length}.</p>}
      </div>
    </div>
  )
}

interface RowProps {
  paint: Paint
  open: boolean
  toggle: () => void
  change: (patch: PaintOverride) => void
  reset: () => void
}

const Row = ({ paint: p, open, toggle, change, reset }: RowProps) => (
  <>
    <tr className="border-b border-line/60">
      <td className="px-3 py-1.5"><span className="block h-9 w-14 rounded" style={{ background: p.hex ?? 'repeating-linear-gradient(45deg,#555 0 5px,#666 5px 10px)' }} /></td>
      <td className="font-code whitespace-nowrap px-3 text-base font-bold">{p.code}</td>
      <td className="whitespace-nowrap px-3">{p.name}</td>
      <td className="px-3"><HexInput paint={p} onChange={(hex) => change({ hex })} /></td>
      <td className="whitespace-nowrap px-3 text-dim">
        {p.hexSource}
        {p.gap >= GAP_WARNING && p.hexSource !== 'Yours' && <span className="ml-2 rounded bg-label px-1.5 py-0.5 text-xs text-label-ink">sources disagree</span>}
      </td>
      <td className="whitespace-nowrap px-3">{p.brand}</td>
      <td className="whitespace-nowrap px-3">{p.line}</td>
      <td className="whitespace-nowrap px-3">{p.type}{p.detail && <span className="text-dim"> {p.detail}</span>}</td>
      <td className="whitespace-nowrap px-3">{p.group}</td>
      <td className="px-3 text-center"><input type="checkbox" aria-label={`Use ${p.name} in the mixer`} checked={p.inMixer} disabled={!p.hex} onChange={(e) => change({ inMixer: e.target.checked })} /></td>
      <td className="px-3 text-center"><input type="checkbox" aria-label={`${p.name} checked`} checked={p.checked} onChange={(e) => change({ checked: e.target.checked })} /></td>
      <td className="px-3"><button type="button" className="btn" aria-expanded={open} onClick={toggle}>{open ? 'Close' : 'Details'}</button></td>
    </tr>
    {open && (
      <tr className="border-b border-line bg-panel">
        <td colSpan={12} className="p-4">
          <div className="flex flex-wrap gap-6">
            <figure className="m-0">
              <img src={`./labels/${p.code}.jpg`} alt={`Label photo of ${p.name} ${p.code}`} className="block h-52 rounded" loading="lazy" />
              <figcaption className="mt-1 text-xs text-dim">Your photo, {p.seen}</figcaption>
            </figure>
            <div className="min-w-64 max-w-md">
              <h4 className="mb-2 font-semibold">Hex references</h4>
              <ul className="grid gap-1.5">
                {[...(p.hex ? [{ hex: p.hex, source: `${p.hexSource} (in use)` }] : []), ...p.references].map((r) => (
                  <li key={r.source} className="flex items-center gap-2">
                    <span className="h-7 w-12 rounded" style={{ background: r.hex }} />
                    <span className="tnum">{r.hex}</span>
                    <span className="text-dim">{r.source}</span>
                    {r.hex !== p.hex && <button type="button" className="btn ml-auto py-0.5" onClick={() => change({ hex: r.hex })}>Use</button>}
                  </li>
                ))}
                {!p.hex && p.references.length === 0 && <li className="text-dim">No source lists a hex for this paint. Type one in the table.</li>}
              </ul>
              <button type="button" className="btn mt-3" onClick={reset}>Undo my changes</button>
            </div>
            <div className="min-w-64">
              <h4 className="mb-2 font-semibold">Mixing behaviour</h4>
              {(['strength', 'hiding'] as const).map((key) => (
                <label key={key} className="mb-2 flex items-center gap-3">
                  <span className="w-28 text-dim">{key === 'strength' ? 'Tint strength' : 'Hiding power'}</span>
                  <input type="range" min={0.2} max={4} step={0.1} value={p[key]} onChange={(e) => change({ [key]: Number(e.target.value) })} />
                  <span className="w-8 tnum">{p[key].toFixed(1)}</span>
                </label>
              ))}
              <p className="max-w-xs text-dim">1.0 is an average paint. Raise strength if it takes over a mix in real life; raise hiding if it covers in fewer coats.</p>
            </div>
            <dl className="grid h-fit grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-dim">Name from</dt><dd>{p.nameSource}</dd>
              <dt className="text-dim">Label score</dt><dd className="tnum">{p.score} / 10{p.confirmed ? ', confirmed by you' : ''}</dd>
            </dl>
          </div>
        </td>
      </tr>
    )}
  </>
)
