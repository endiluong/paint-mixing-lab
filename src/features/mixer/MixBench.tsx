import { useMemo } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { closeness, inkOn } from '@/lib/color'
import { closestPaints, type RecipeItem } from '@/lib/match'
import { mixHex } from '@/lib/paintModel'
import type { UsablePaint } from '@/lib/types'
import type { MixItem, SavedSwatch } from './bench'

interface Props {
  mix: RecipeItem[]
  mixed: string | null
  paints: UsablePaint[]
  setMixItems: (next: MixItem[]) => void
  save: (swatch: Omit<SavedSwatch, 'id'>) => void
}

const PRESETS: Record<number, number[][]> = {
  2: [[9, 1], [4, 1], [3, 1], [2, 1], [1, 1], [1, 2], [1, 3], [1, 4], [1, 9]],
  3: [[1, 1, 1], [3, 1, 1], [1, 3, 1], [1, 1, 3], [2, 2, 1], [2, 1, 2], [1, 2, 2], [4, 2, 1], [1, 2, 4]],
  4: [[1, 1, 1, 1], [3, 1, 1, 1], [1, 3, 1, 1], [1, 1, 3, 1], [1, 1, 1, 3], [2, 2, 1, 1], [2, 1, 2, 1], [1, 2, 2, 1], [1, 1, 2, 2]],
}

export const MixBench = ({ mix, mixed, paints, setMixItems, save }: Props) => {
  const total = mix.reduce((s, i) => s + i.parts, 0)
  const set = (code: string, parts: number): void => setMixItems(mix.map((i) => ({ code: i.paint.code, parts: i.paint.code === code ? Math.min(20, Math.max(1, parts)) : i.parts })))
  const nearest = useMemo(() => (mixed && mix.length > 1 ? closestPaints(mixed, paints, 1)[0] : null), [mixed, mix.length, paints])
  const presets = useMemo(
    () =>
      (PRESETS[mix.length] ?? []).map((ratio) => ({
        ratio,
        hex: mixHex(mix.map((i, n) => ({ hex: i.paint.hex, parts: ratio[n], strength: i.paint.strength }))) ?? '#000000',
      })),
    [mix],
  )

  if (mix.length === 0) return <p className="py-4 text-dim">Press + on two, three or four paints in the list. The mix appears here and as a diamond on the graph.</p>

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_210px]">
      <div className="min-w-0">
        <ul className="grid gap-2">
          {mix.map(({ paint, parts }) => (
            <li key={paint.code} className="flex items-center gap-2">
              <span className="h-8 w-8 shrink-0 rounded" style={{ background: paint.hex }} />
              <span className="min-w-0 flex-1 truncate">{paint.name} <span className="font-code text-dim">{paint.code}</span></span>
              <button type="button" className="btn px-2" aria-label={`Less ${paint.name}`} onClick={() => set(paint.code, parts - 1)} disabled={parts <= 1}><Minus size={14} /></button>
              <span className="w-8 text-center text-base font-semibold tnum">{parts}</span>
              <button type="button" className="btn px-2" aria-label={`More ${paint.name}`} onClick={() => set(paint.code, parts + 1)} disabled={parts >= 20}><Plus size={14} /></button>
              <span className="w-11 text-right text-sm text-dim tnum">{Math.round((parts / total) * 100)}%</span>
              <button type="button" className="p-1.5 text-dim hover:text-text" aria-label={`Remove ${paint.name}`} onClick={() => setMixItems(mix.filter((i) => i.paint.code !== paint.code).map((i) => ({ code: i.paint.code, parts: i.parts })))}><X size={16} /></button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex h-3 overflow-hidden rounded" aria-hidden>
          {mix.map(({ paint, parts }) => <span key={paint.code} style={{ background: paint.hex, flex: parts }} />)}
        </div>
        {presets.length > 0 && (
          <>
            <h3 className="mb-1.5 mt-4 text-sm text-dim">Test swatches, in parts. Press one to use it.</h3>
            <div className="grid grid-cols-5 gap-1 sm:grid-cols-9">
              {presets.map(({ ratio, hex }) => (
                <button key={ratio.join(':')} type="button" className="flex h-14 items-end justify-center rounded pb-1 text-[11px] font-semibold tnum" style={{ background: hex, color: inkOn(hex) }} title={hex} onClick={() => setMixItems(mix.map((i, n) => ({ code: i.paint.code, parts: ratio[n] })))}>
                  {ratio.join(':')}
                </button>
              ))}
            </div>
          </>
        )}
        {mix.length === 1 && <p className="mt-3 text-sm text-dim">Add one more paint to start mixing.</p>}
      </div>
      {mixed && (
        <div className="flex flex-col gap-2">
          <div className="flex h-32 flex-col justify-end rounded-lg p-3" style={{ background: mixed, color: inkOn(mixed) }}>
            <span className="text-lg font-semibold tnum">{mixed}</span>
            <span className="text-sm tnum">{mix.map((i) => i.parts).join(' : ')}</span>
          </div>
          {nearest && <p className="text-sm text-dim">Closest paint you own: <span className="text-text">{nearest.paint.name} {nearest.paint.code}</span>, {closeness(nearest.distance)}.</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-main flex-1" disabled={mix.length < 2} onClick={() => save({ kind: 'mix', hex: mixed, steps: [mixed], recipe: mix.map((i) => `${i.parts} ${i.paint.name} ${i.paint.code}`).join(' + ') })}>Save swatch</button>
            <button type="button" className="btn" onClick={() => setMixItems([])}>Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}
