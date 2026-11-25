import { useMemo } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { inkOn } from '@/lib/color'
import { layerCurve, layerSteps, curveOf, curveToHex } from '@/lib/paintModel'
import type { UsablePaint } from '@/lib/types'
import { MAX_LAYERS, type LayerItem, type LayerState, type SavedSwatch } from './bench'

export interface LayerDatum {
  item: LayerItem
  name: string
  code: string
  hex: string
  curve: number[]
  hiding: number
}

interface Props {
  base: UsablePaint | null
  data: LayerDatum[]
  steps: string[]
  hasMix: boolean
  state: LayerState
  setLayer: (next: LayerState | ((prev: LayerState) => LayerState)) => void
  mine: UsablePaint[]
  save: (swatch: Omit<SavedSwatch, 'id'>) => void
}

const STRIP = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

export const LayerBench = ({ base, data, steps, hasMix, state, setLayer, mine, save }: Props) => {
  const black = mine.find((p) => p.code === '70.950')
  const white = mine.find((p) => p.code === '70.951')
  const result = steps[steps.length - 1]
  const last = data[data.length - 1]

  const strip = useMemo(() => {
    if (!base || !last) return []
    const under = data.slice(0, -1)
    let surface = curveOf(base.hex).R
    for (const l of under) surface = layerCurve(surface, l.curve, l.item.opacity, l.hiding)
    return STRIP.map((o) => ({ opacity: o, hex: curveToHex(layerCurve(surface, last.curve, o, last.hiding)) }))
  }, [base, data, last])

  /** The same layers over white, to see how much the base matters. */
  const overWhite = useMemo(() => {
    if (!data.length) return null
    const s = layerSteps('#FFFFFF', data.map((l) => ({ curve: l.curve, opacity: l.item.opacity, hiding: l.hiding })))
    return s[s.length - 1]
  }, [data])

  const patch = (id: string, opacity: number): void => setLayer((prev) => ({ ...prev, layers: prev.layers.map((l) => (l.id === id ? { ...l, opacity } : l)) }))
  const move = (id: string, by: number): void =>
    setLayer((prev) => {
      const i = prev.layers.findIndex((l) => l.id === id)
      const j = i + by
      if (i < 0 || j < 0 || j >= prev.layers.length) return prev
      const layers = [...prev.layers]
      ;[layers[i], layers[j]] = [layers[j], layers[i]]
      return { ...prev, layers }
    })

  if (!base) {
    return (
      <div className="py-4">
        <p className="mb-3 text-dim">Choose the base coat: press + on any paint in the list, or start from a primer color.</p>
        <div className="flex gap-2">
          {black && <button type="button" className="btn" onClick={() => setLayer((p) => ({ ...p, base: black.id }))}>Black base</button>}
          {white && <button type="button" className="btn" onClick={() => setLayer((p) => ({ ...p, base: white.id }))}>White base</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_210px]">
      <div className="min-w-0">
        <ol className="grid gap-2">
          <li className="flex items-center gap-2">
            <span className="h-8 w-8 shrink-0 rounded border border-line" style={{ background: base.hex }} />
            <span className="min-w-0 flex-1 truncate">Base: {base.name} <span className="font-code text-dim">{base.code}</span></span>
            <button type="button" className="btn" onClick={() => setLayer((p) => ({ ...p, base: '' }))}>Change base</button>
          </li>
          {data.map(({ item, name, code, hex }, n) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2">
              <span className="h-8 w-8 shrink-0 rounded" style={{ background: hex }} />
              <span className="w-40 min-w-0 truncate">{n + 1}. {name} <span className="font-code text-dim">{code}</span></span>
              <input type="range" min={0} max={100} step={1} className="min-w-24 flex-1" aria-label={`Opacity of ${name}`} value={Math.round(item.opacity * 100)} onChange={(e) => patch(item.id, Number(e.target.value) / 100)} />
              <span className="w-11 text-right font-semibold tnum">{Math.round(item.opacity * 100)}%</span>
              <button type="button" className="p-1 text-dim hover:text-text" aria-label={`Paint ${name} earlier`} disabled={n === 0} onClick={() => move(item.id, -1)}><ArrowUp size={15} /></button>
              <button type="button" className="p-1 text-dim hover:text-text" aria-label={`Paint ${name} later`} disabled={n === data.length - 1} onClick={() => move(item.id, 1)}><ArrowDown size={15} /></button>
              <button type="button" className="p-1 text-dim hover:text-text" aria-label={`Remove ${name}`} onClick={() => setLayer((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== item.id) }))}><X size={16} /></button>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {data.length === 0 && <p className="text-sm text-dim">Press + on a paint to lay it over the base.</p>}
          {hasMix && state.layers.length < MAX_LAYERS && <button type="button" className="btn" onClick={() => setLayer((p) => ({ ...p, layers: [...p.layers, { id: crypto.randomUUID(), source: 'mix', opacity: 0.5 }] }))}>Layer the current mix</button>}
        </div>
        {strip.length > 0 && last && (
          <>
            <h3 className="mb-1.5 mt-4 text-sm text-dim">{last.name} at each opacity over the layers below. Press one to use it.</h3>
            <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
              {strip.map(({ opacity, hex }) => (
                <button key={opacity} type="button" className="flex h-14 items-end justify-center rounded pb-1 text-[11px] font-semibold tnum" style={{ background: hex, color: inkOn(hex) }} title={hex} onClick={() => patch(last.item.id, opacity)}>
                  {Math.round(opacity * 100)}%
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex h-32 overflow-hidden rounded-lg border border-line" aria-label="Base on the left, each coat added to the right">
          {steps.map((hex, i) => <span key={i} title={hex} style={{ background: hex, flex: i === steps.length - 1 ? 2 : 1 }} />)}
        </div>
        {result && <p className="text-lg font-semibold tnum">{result}</p>}
        {overWhite && <p className="flex items-center gap-2 text-sm text-dim"><span className="h-5 w-5 rounded" style={{ background: overWhite }} />Same coats over white: <span className="text-text tnum">{overWhite}</span></p>}
        <div className="flex gap-2">
          <button type="button" className="btn-main flex-1" disabled={data.length === 0} onClick={() => save({ kind: 'layer', hex: result, steps, recipe: [`Base ${base.name} ${base.code}`, ...data.map((l) => `${[l.name, l.code].filter(Boolean).join(' ')} ${Math.round(l.item.opacity * 100)}%`)].join(', then ') })}>Save swatch</button>
          <button type="button" className="btn" onClick={() => setLayer({ base: '', layers: [] })}>Clear</button>
        </div>
      </div>
    </div>
  )
}
