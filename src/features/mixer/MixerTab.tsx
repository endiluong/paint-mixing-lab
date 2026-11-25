import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { applyFilter, EMPTY_FILTER, Filters, type FilterState } from '@/components/Filters'
import { OwnedMark, PaintPill, PILL_ACTION } from '@/components/PaintPill'
import { Segmented } from '@/components/Segmented'
import { usePersisted } from '@/hooks/usePersisted'
import { loadLibrary, notOwned } from '@/lib/library'
import { curveOf, layerSteps, mixCurve, mixHex } from '@/lib/paintModel'
import type { MixPart, Paint, UsablePaint } from '@/lib/types'
import { MAX_LAYERS, MAX_MIX, type BenchMode, type LayerState, type Marker, type MixItem, type SavedSwatch } from './bench'
import { ColorWheel } from './ColorWheel'
import { LayerBench } from './LayerBench'
import { MatchBench } from './MatchBench'
import { MixBench } from './MixBench'
import { SavedBench } from './SavedBench'

const ColorSphere = lazy(() => import('./ColorSphere').then((m) => ({ default: m.ColorSphere })))

interface Props {
  /** Paints of the collection that can be mixed. */
  paints: UsablePaint[]
  collection: Paint[]
  mixItems: MixItem[]
  setMixItems: (next: MixItem[] | ((prev: MixItem[]) => MixItem[])) => void
  /** Colour sent from another tab to look at on the graph. */
  probe: string | null
  create: () => void
  edit: (id: string) => void
  remove: (id: string) => void
  /** Adds a paint from the library to the collection. */
  own: (paint: UsablePaint) => void
}

type Surround = 'dark' | 'grey' | 'white'
const SURROUND: Record<Surround, string> = { dark: '#262626', grey: '#777777', white: '#f2f2f2' }

type Scope = 'mine' | 'all'
const PAGE = 200

export const MixerTab = ({ paints: mine, collection, mixItems, setMixItems, probe, create, edit, remove, own }: Props) => {
  const [scope, setScope] = usePersisted<Scope>('pml.scope', 'mine')
  const [library, setLibrary] = useState<UsablePaint[]>([])
  const [libraryState, setLibraryState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [limit, setLimit] = useState(PAGE)
  const [layer, setLayer] = usePersisted<LayerState>('pml.layer', { base: '', layers: [] })
  const [view, setView] = usePersisted<'3d' | '2d'>('pml.view', '3d')
  const [surround, setSurround] = usePersisted<Surround>('pml.surround', 'dark')
  const [mode, setMode] = useState<BenchMode>(probe ? 'match' : 'mix')
  const [open, setOpen] = useState(true)
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER)
  const [selected, setSelected] = useState<string | null>(null)
  const [saved, setSaved] = usePersisted<SavedSwatch[]>('pml.saved', [])
  const [target, setTarget] = useState(probe ?? '#6B7A3A')

  useEffect(() => {
    if (selected && window.matchMedia('(min-width: 1024px)').matches) document.getElementById(`paint-${selected}`)?.scrollIntoView({ block: 'nearest' })
  }, [selected, limit])

  const stored = useMemo(() => [...mixItems.map((i) => i.code), layer.base, ...layer.layers.map((l) => l.source)].some((id) => id.includes('|')), [mixItems, layer])
  const wanted = scope === 'all' || stored
  useEffect(() => {
    if (!wanted) return
    let live = true
    setLibraryState((s) => (s === 'ready' ? s : 'loading'))
    loadLibrary().then(
      (rows) => {
        if (!live) return
        setLibrary(rows)
        setLibraryState('ready')
      },
      () => live && setLibraryState('failed'),
    )
    return () => {
      live = false
    }
  }, [wanted])

  const everything = useMemo(() => (libraryState === 'ready' ? [...mine, ...notOwned(library, collection)] : mine), [mine, library, libraryState, collection])
  const paints = scope === 'all' ? everything : mine
  const byCode = useMemo(() => new Map(everything.map((p) => [p.id, p])), [everything])
  const shown = useMemo(() => applyFilter(paints, filter), [paints, filter])
  const listed = shown.slice(0, limit)
  const chosen = selected ? (byCode.get(selected) ?? null) : null

  const mix = useMemo(() => mixItems.flatMap((i) => (byCode.has(i.code) ? [{ paint: byCode.get(i.code) as UsablePaint, parts: i.parts }] : [])), [mixItems, byCode])
  const mixParts = useMemo<MixPart[]>(() => mix.map((i) => ({ hex: i.paint.hex, parts: i.parts, strength: i.paint.strength })), [mix])
  const mixed = useMemo(() => mixHex(mixParts), [mixParts])

  const base = byCode.get(layer.base) ?? null
  const layerData = useMemo(
    () =>
      layer.layers.flatMap((l) => {
        if (l.source === 'mix') return mixed ? [{ item: l, name: 'Current mix', code: '', hex: mixed, curve: mixParts.length > 1 ? mixCurve(mixParts) : curveOf(mixed).R, hiding: 1 }] : []
        const p = byCode.get(l.source)
        return p ? [{ item: l, name: p.name, code: p.code, hex: p.hex, curve: curveOf(p.hex).R, hiding: p.hiding }] : []
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

  const changeFilter = (next: FilterState): void => {
    setFilter(next)
    setLimit(PAGE)
  }
  /** A dot picked on the graph must also be reachable in the list. */
  const pick = useCallback(
    (id: string | null) => {
      setSelected(id)
      const at = shown.findIndex((p) => p.id === id)
      if (at >= 0) setLimit((l) => Math.max(l, at + 20))
    },
    [shown],
  )

  const addLabel = mode === 'layer' ? (layer.base ? 'Add as next layer' : 'Use as base') : mode === 'match' ? 'Use as target' : 'Add to mix'
  const full = mode === 'layer' ? layer.layers.length >= MAX_LAYERS : mode === 'mix' ? mix.length >= MAX_MIX : false
  const save = (swatch: Omit<SavedSwatch, 'id'>): void => setSaved((prev) => [{ ...swatch, id: crypto.randomUUID() }, ...prev].slice(0, 60))

  return (
    <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] lg:h-full lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="flex min-h-0 min-w-0 flex-col border-line lg:border-r" aria-label="Color graph and bench">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2">
          <Segmented label="View" value={view} onChange={setView} options={[{ value: '3d', label: '3D sphere' }, { value: '2d', label: '2D wheel' }]} />
          <Segmented
            label="Paints shown"
            value={scope}
            onChange={(s) => {
              setScope(s)
              setFilter((f) => ({ ...EMPTY_FILTER, sort: f.sort, group: f.group }))
              setSelected(null)
              setLimit(PAGE)
            }}
            options={[
              { value: 'mine', label: `My paints ${mine.length}` },
              { value: 'all', label: libraryState === 'loading' ? 'All paints, loading' : `All paints ${libraryState === 'ready' ? everything.length.toLocaleString('en') : ''}`.trim() },
            ]}
          />
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
              <ColorSphere points={shown} markers={markers} selected={selected} onSelect={pick} />
            </Suspense>
          ) : (
            <ColorWheel points={shown} markers={markers} selected={selected} onSelect={pick} />
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
              {mode === 'mix' && <MixBench mix={mix} mixed={mixed} mine={mine} setMixItems={setMixItems} save={save} />}
              {mode === 'layer' && <LayerBench base={base} data={layerData} steps={steps} hasMix={mixed !== null} state={layer} setLayer={setLayer} mine={mine} save={save} />}
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
          <Filters paints={paints} value={filter} onChange={changeFilter} />
          <div className="mt-2 flex items-center gap-2 text-sm text-dim">
            <span className="tnum">{shown.length.toLocaleString('en')} {shown.length === 1 ? 'paint' : 'paints'}</span>
            <span className="ml-2 inline-flex items-center gap-1.5"><OwnedMark ink="#f0f0f0" paper="#111111" /><span aria-hidden>In your paints</span></span>
            <button type="button" className="btn ml-auto text-text" onClick={create}><Plus size={15} />Add a paint</button>
          </div>
          {scope === 'all' && libraryState === 'failed' && <p role="alert" className="mt-2 text-sm">The other paints did not load. Reload the page to try again.</p>}
        </div>
        <ul className="scroll flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto p-3">
          {listed.map((p) => (
            <li key={p.id} id={`paint-${p.id}`} className="max-w-full">
              <PaintPill hex={p.hex} metal={p.metal} code={p.code} name={p.name} owned={p.owned} title={`${p.brand}, ${p.line}, ${p.hex}`} selected={p.id === selected} onClick={() => setSelected(p.id === selected ? null : p.id)}>
                <button type="button" className={PILL_ACTION} aria-label={`${addLabel}: ${p.name} ${p.code}`} title={addLabel} disabled={full} onClick={() => add(p.id)}>
                  <Plus size={16} />
                </button>
              </PaintPill>
            </li>
          ))}
          {shown.length > listed.length && <li className="w-full"><button type="button" className="btn w-full" onClick={() => setLimit(limit + PAGE * 2)}>Show more, {(shown.length - listed.length).toLocaleString('en')} left</button></li>}
          {shown.length === 0 && <li className="w-full p-4 text-dim">{paints.length === 0 ? 'No paints yet. Press Add a paint, or bring back the built-in paints in the Inventory.' : `No paint matches these filters. Clear them to see all ${paints.length}.`}</li>}
        </ul>
        {chosen && (
          <div className="sticky bottom-0 border-t border-line bg-panel p-3" aria-label="Selected paint" role="group">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 shrink-0 rounded-[8px] ring-1 ring-inset ring-white/20" style={{ background: chosen.hex }} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{chosen.name} <span className="font-code">{chosen.code}</span></p>
                <p className="truncate text-sm text-dim">{chosen.owned ? 'In your paints' : 'Not in your paints'}. {chosen.brand}, {chosen.line}, <span className="tnum">{chosen.hex}</span></p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={chosen.owned ? 'btn-main' : 'btn'} disabled={full} onClick={() => add(chosen.id)}>{addLabel}</button>
              {chosen.owned ? (
                <>
                  <button type="button" className="btn" onClick={() => edit(chosen.id)}><Pencil size={15} />Edit</button>
                  <button type="button" className="btn" onClick={() => remove(chosen.id)}><Trash2 size={15} />Remove</button>
                </>
              ) : <button type="button" className="btn-main" onClick={() => own(chosen)}><Plus size={15} />Add to my paints</button>}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
