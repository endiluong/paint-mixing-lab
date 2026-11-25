import { useEffect, useMemo, useState } from 'react'
import { Segmented } from '@/components/Segmented'
import { closeness, inkOn, isHex } from '@/lib/color'
import { closestPaints, findMixes, type Recipe } from '@/lib/match'
import type { UsablePaint } from '@/lib/types'
import type { MixItem } from './bench'

interface Props {
  paints: UsablePaint[]
  target: string
  setTarget: (hex: string) => void
  load: (items: MixItem[]) => void
}

export const MatchBench = ({ paints, target, setTarget, load }: Props) => {
  const [text, setText] = useState(target)
  const [max, setMax] = useState<'2' | '3'>('2')
  const [mixes, setMixes] = useState<Recipe[]>([])
  useEffect(() => setText(target), [target])
  useEffect(() => {
    const t = setTimeout(() => setMixes(findMixes(target, paints, max === '3' ? 3 : 2)), 120)
    return () => clearTimeout(t)
  }, [target, paints, max])
  const singles = useMemo(() => closestPaints(target, paints, 4), [target, paints])

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input type="color" aria-label="Pick the target color" value={target.toLowerCase()} onChange={(e) => setTarget(e.target.value.toUpperCase())} className="h-10 w-14 rounded border border-line bg-desk" />
        <input
          className="field w-28 tnum"
          aria-label="Target hex"
          value={text}
          aria-invalid={!isHex(text)}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
            setText(v)
            if (isHex(v)) setTarget(v.toUpperCase())
          }}
        />
        <Segmented label="Paints per mix" value={max} onChange={setMax} options={[{ value: '2', label: 'Up to 2 paints' }, { value: '3', label: 'Up to 3 paints' }]} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-sm text-dim">Straight from the bottle</h3>
          <ul className="grid gap-1.5">
            {singles.map(({ paint, distance }) => (
              <li key={paint.id} className="flex items-center gap-2">
                <span className="flex h-8 w-16 shrink-0 overflow-hidden rounded"><span className="flex-1" style={{ background: target }} /><span className="flex-1" style={{ background: paint.hex }} /></span>
                <span className="min-w-0 flex-1 truncate">{paint.name} <span className="font-code text-dim">{paint.code}</span>{!paint.owned && <span className="text-xs text-dim"> {paint.brand}, not owned</span>}</span>
                <span className="text-sm text-dim">{closeness(distance)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-1.5 text-sm text-dim">Best mixes, target on the left. Press one to open it.</h3>
          <ul className="grid gap-1.5">
            {mixes.map((m) => (
              <li key={m.items.map((i) => i.paint.id).join()}>
                <button type="button" className="flex w-full items-center gap-2 rounded text-left hover:bg-raised" onClick={() => load(m.items.map((i) => ({ code: i.paint.id, parts: i.parts })))}>
                  <span className="flex h-9 w-16 shrink-0 overflow-hidden rounded"><span className="flex-1" style={{ background: target }} /><span className="flex-1" style={{ background: m.hex, color: inkOn(m.hex) }} /></span>
                  <span className="min-w-0 flex-1 text-sm">{m.items.map((i) => `${i.parts} ${i.paint.name}`).join(' + ')}</span>
                  <span className="shrink-0 text-sm text-dim">{closeness(m.distance)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
