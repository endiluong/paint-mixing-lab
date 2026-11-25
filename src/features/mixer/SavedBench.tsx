import { Target, X } from 'lucide-react'
import { inkOn } from '@/lib/color'
import type { SavedSwatch } from './bench'

interface Props {
  saved: SavedSwatch[]
  remove: (id: string) => void
  setTarget: (hex: string) => void
}

export const SavedBench = ({ saved, remove, setTarget }: Props) => {
  if (saved.length === 0) return <p className="py-4 text-dim">Nothing saved yet. Press "Save swatch" on a mix or a layer test to compare it here later.</p>
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
      {saved.map((s) => (
        <li key={s.id} className="overflow-hidden rounded-lg bg-raised">
          <div className="flex h-20">
            {s.steps.map((hex, i) => (
              <span key={i} className="flex items-end p-1.5 text-xs font-semibold tnum" style={{ background: hex, color: inkOn(hex), flex: i === s.steps.length - 1 ? 3 : 1 }}>{i === s.steps.length - 1 ? hex : ''}</span>
            ))}
          </div>
          <div className="flex items-start gap-1 p-2">
            <p className="min-w-0 flex-1 text-xs">{s.recipe}</p>
            <button type="button" className="p-1 text-dim hover:text-text" aria-label="Match this color" title="Match this color" onClick={() => setTarget(s.hex)}><Target size={15} /></button>
            <button type="button" className="p-1 text-dim hover:text-text" aria-label="Delete swatch" title="Delete swatch" onClick={() => remove(s.id)}><X size={15} /></button>
          </div>
        </li>
      ))}
    </ul>
  )
}
