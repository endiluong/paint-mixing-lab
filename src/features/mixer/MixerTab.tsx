import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { applyFilter, EMPTY_FILTER, Filters, type FilterState } from '@/components/Filters'
import { PaintLabel } from '@/components/PaintLabel'
import { Segmented } from '@/components/Segmented'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { curveOf, layerSteps, mixCurve, mixHex } from '@/lib/paintModel'
import type { MixPart, UsablePaint } from '@/lib/types'
import { MAX_LAYERS, MAX_MIX, type BenchMode, type LayerState, type Marker, type MixItem, type SavedSwatch } from './bench'
import { ColorWheel } from './ColorWheel'
import { LayerBench } from './LayerBench'
import { MatchBench } from './MatchBench'
import { MixBench } from './MixBench'
import { SavedBench } from './SavedBench'

const ColorSphere = lazy(() => import('./ColorSphere').then((m) => ({ default: m.ColorSphere })))

interface Props {
  paints: UsablePaint[]
  mixItems: MixItem[]
  setMixItems: (next: MixItem[] | ((prev: MixItem[]) => MixItem[])) => void
}

type Surround = 'dark' | 'grey' | 'white'
const SURROUND: Record<Surround, string> = { dark: '#262626', grey: '#777777', white: '#f2f2f2' }

export const MixerTab = ({ paints, mixItems, setMixItems }: Props) => {
  const [view, setView] = useLocalStorage<'3d' | '2d'>('pml.view', '3d')
  const [surround, setSurround] = useLocalStorage<Surround>('pml.surround', 'dark')
  const [mode, setMode] = useState<BenchMode>('mix')
  const [open, setOpen] = useState(true)
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER)
  const [selected, setSelected] = useState<string | null>(null)
  const [layer, setLayer] = useLocalStorage<LayerState>('pml.layer', { base: '', layers: [] })
  const [saved, setSaved] = useLocalStorage<SavedSwatch[]>('pml.saved', [])
  const [target, setTarget] = useState('#6B7A3A')

  useEffect(() => {
    if (selected && window.matchMedia('(min-width: 1024px)').matches) document.getElementById(`paint-${selected}`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const byCode = useMemo(() => new Map(paints.map((p) => [p.code, p])), [paints])
  const shown = useMemo(() => applyFilter(paints, filter), [paints, filter])

  const mix = useMemo(() => mixItems.flatMap((i) => (byCode.has(i.code) ? [{ paint: byCode.get(i.code) as UsablePaint, parts: i.parts }] : [])), [mixItems, byCode])
  const mixParts = useMemo<MixPart[]>(() => mix.map((i) => ({ hex: i.paint.hex, parts: i.parts, strength: i.paint.strength })), [mix])
  const mixed = useMemo(() => mixHex(mixParts), [mixParts])

  const base = byCode.get(layer.base) ?? null
  const layerData = useMemo(
    () =>
      layer.layers.flatMap((l) => {
        if (l.source === 'mix') return mixed ? [{ item: l, name: 'Current mix', hex: mixed, curve: mixParts.length > 1 ? mixCurve(mixParts) : curveOf(mixed).R, hiding: 1 }] : []
        const p = byCode.get(l.source)
        return p ? [{ item: l, name: p.name, hex: p.hex, curve: curveOf(p.hex).R, hiding: p.hiding }] : []
      }),
    [layer.layers, mixed, mixParts, byCode],
  )
  const steps = useMemo(
    () => (base ? layerSteps(base.hex, layerData.map((l) => ({ curve: l.curve, opacity: l.item.opacity, hiding: l.hiding }))) : []),
    [base, layerData],
  )

  const markers = useMemo<Marker[]>(() => {
    if (mode === 'mix' && mixed && mix.length > 1) return [{ hex: mixed, label: 'Mix' }]
    if (mode === 'layer' && steps.length > 1) return [{ hex: steps[steps.length - 1], label: 'Layered result' }]
    if (mode === 'match') return [{ hex: target, label: 'Target' }]
    return []
  }, [mode, mixed, mix.length, steps, target])

  const add = useCallback(
    (code: string) => {
      setSelected(code)
      setOpen(true)
      if (mode === 'layer') {
        setLayer((prev) => {
          if (!prev.base) return { ...prev, base: code }
          if (prev.layers.length >= MAX_LAYERS) return prev
          return { ...prev, layers: [...prev.layers, { id: crypto.randomUUID(), source: code, opacity: 0.5 }] }
        })
        return
      }
      if (mode === 'match') {
        const p = byCode.get(code)
        if (p) setTarget(p.hex)
        return
      }
      if (mode === 'saved') setMode('mix')
      setMixItems((prev) => {
        const live = prev.filter((i) => byCode.has(i.code))
        if (live.length >= MAX_MIX || live.some((i) => i.code === code)) return live
        return [...live, { code, parts: 1 }]
      })
    },
    [mode, byCode, setLayer, setMixItems],
  )

  const addLabel = mode === 'layer' ? (layer.base ? 'Add as next layer' : 'Use as base') : mode === 'match' ? 'Use as target' : 'Add to mix'
  const full = mode === 'layer' ? layer.layers.length >= MAX_LAYERS : mode === 'mix' ? mix.length >= MAX_MIX : false
  const save = (swatch: Omit<SavedSwatch, 'id'>): void => setSaved((prev) => [{ ...swatch, id: crypto.randomUUID() }, ...prev].slice(0, 60))

  return (
    <div className="grid min-h-0 lg:h-full lg:grid-cols-[3fr_2fr]">
      <section className="flex min-h-0 min-w-0 flex-col border-line lg:border-r" aria-label="Color graph and bench">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2">
          <Segmented label="View" value={view} onChange={setView} options={[{ value: '3d', label: '3D sphere' }, { value: '2d', label: '2D wheel' }]} />
          <span className="text-sm text-dim tnum">{shown.length} paints</span>
          <label className="ml-auto flex items-center gap-2 text-sm text-dim">
            Background
            <select className="field" value={surround} onChange={(e) => setSurround(e.target.value as Surround)}>
              <option value="dark">Dark</option>
              <option value="grey">Mid grey</option>
              <option value="white">White</option>
            </select>
          </label>
        </div>
        <div className="h-[56vh] min-h-64 lg:h-auto lg:flex-1" style={{ background: SURROUND[surround] }}>
          {view === '3d' ? (
            <Suspense fallback={<p className="p-6 text-dim">Loading the sphere</p>}>
              <ColorSphere points={shown} markers={markers} selected={selected} onSelect={setSelected} />
            </Suspense>
          ) : (
            <ColorWheel points={shown} markers={markers} selected={selected} onSelect={setSelected} />
          )}
        </div>
        <div className="border-t border-line bg-panel">
          <div className="flex flex-wrap items-center gap-3 px-4 py-2">
            <Segmented
              label="Bench"
              value={mode}
              onChange={(m) => {
                setMode(m)
                setOpen(true)
              }}
              options={[{ value: 'mix', label: 'Mix' }, { value: 'layer', label: 'Layer' }, { value: 'match', label: 'Match a color' }, { value: 'saved', label: `Swatches ${saved.length}` }]}
            />
            <button type="button" className="btn ml-auto" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              {open ? 'Hide bench' : 'Show bench'}
            </button>
          </div>
          {open && (
            <div className="scroll max-h-[46vh] overflow-y-auto px-4 pb-4 lg:max-h-[40vh]">
              {mode === 'mix' && <MixBench mix={mix} mixed={mixed} paints={paints} setMixItems={setMixItems} save={save} />}
              {mode === 'layer' && <LayerBench base={base} data={layerData} steps={steps} hasMix={mixed !== null} state={layer} setLayer={setLayer} paints={paints} save={save} />}
              {mode === 'match' && (
                <MatchBench
                  paints={paints}
                  target={target}
                  setTarget={setTarget}
                  load={(items) => {
                    setMixItems(items)
                    setMode('mix')
                  }}
                />
              )}
              {mode === 'saved' && <SavedBench saved={saved} remove={(id) => setSaved((prev) => prev.filter((s) => s.id !== id))} setTarget={(hex) => { setTarget(hex); setMode('match') }} />}
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-0 min-w-0 flex-col" aria-label="Paints in the graph">
        <div className="border-b border-line p-3">
          <Filters paints={paints} value={filter} onChange={setFilter} />
        </div>
        <ul className="scroll grid flex-1 content-start gap-1.5 overflow-y-auto p-3">
          {shown.map((p) => (
            <li key={p.code} id={`paint-${p.code}`}>
              <PaintLabel hex={p.hex} code={p.code} name={p.name} sub={`${p.brand}, ${p.line}`} selected={p.code === selected} onClick={() => setSelected(p.code === selected ? null : p.code)}>
                <button type="button" className="shrink-0 px-3 hover:bg-black/10" aria-label={`${addLabel}: ${p.name} ${p.code}`} title={addLabel} disabled={full} onClick={() => add(p.code)}>
                  <Plus size={18} />
                </button>
              </PaintLabel>
            </li>
          ))}
          {shown.length === 0 && <li className="p-4 text-dim">No paint matches these filters. Clear them to see all {paints.length}.</li>}
        </ul>
      </section>
    </div>
  )
}
