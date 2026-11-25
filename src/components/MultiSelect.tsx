import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface MultiOption {
  value: string
  count: number
}

interface Props {
  /** Plural noun, such as "brands". */
  noun: string
  options: MultiOption[]
  value: string[]
  onChange: (next: string[]) => void
}

/** Dropdown with checkboxes. Nothing ticked means everything. */
export const MultiSelect = ({ noun, options, value, onChange }: Props) => {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent): void => {
      if (e.target instanceof Node && !box.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const summary = value.length === 0 ? `All ${noun}` : value.length === 1 ? value[0] : `${value.length} ${noun}`
  const toggle = (v: string): void => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  return (
    <div
      ref={box}
      className="relative min-w-0 flex-1"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false)
          button.current?.focus()
        }
      }}
      onBlur={(e) => {
        if (e.relatedTarget instanceof Node && !box.current?.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <button ref={button} type="button" className="field flex w-full items-center gap-1 text-left" aria-expanded={open} aria-controls={id} aria-label={`Filter ${noun}: ${value.length === 0 ? 'all' : value.join(', ')}`} title={value.join(', ')} onClick={() => setOpen(!open)}>
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronDown size={15} className="shrink-0 text-dim" />
      </button>
      {open && (
        <div id={id} role="group" aria-label={noun} className="scroll absolute right-0 z-30 mt-1 max-h-72 w-max min-w-full max-w-[min(300px,88vw)] overflow-y-auto rounded-md border border-line bg-raised p-1 shadow-xl">
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-[#424242]">
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="min-w-0 flex-1">{o.value}</span>
              <span className="text-dim tnum">{o.count.toLocaleString('en')}</span>
            </label>
          ))}
          <button type="button" className="mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-dim hover:bg-[#424242] hover:text-text" disabled={value.length === 0} onClick={() => onChange([])}>Show all {noun}</button>
        </div>
      )}
    </div>
  )
}
