import { useState } from 'react'
import { hexToLab, wheelPosition } from '@/lib/color'
import type { GraphProps } from './bench'

const R = 200
const at = (hex: string): [number, number] => {
  const [x, y] = wheelPosition(hexToLab(hex))
  return [x * R, y * R]
}

/** Seen from above: angle is hue, distance from the middle is saturation. Lightness is not shown. */
export const ColorWheel = ({ points, markers, selected, onSelect }: GraphProps) => {
  const [hover, setHover] = useState<string | null>(null)
  const top = hover ?? selected
  const ordered = [...points].sort((a, b) => Number(a.code === top) - Number(b.code === top))
  const info = points.find((p) => p.code === top)
  return (
    <div className="relative h-full w-full">
      <svg viewBox="-225 -225 450 450" className="h-full w-full" role="img" aria-label={`Color wheel with ${points.length} paints`}>
        {[1, 0.66, 0.33].map((k) => <circle key={k} r={R * k} fill="none" stroke="#9a9a9a" strokeOpacity={k === 1 ? 0.6 : 0.25} />)}
        <path d={`M-${R} 0H${R}M0 -${R}V${R}`} stroke="#9a9a9a" strokeOpacity={0.2} />
        {ordered.map((p) => {
          const [x, y] = at(p.hex)
          const on = p.code === top
          return (
            <circle
              key={p.code}
              cx={x}
              cy={y}
              r={on ? 9 : 6}
              fill={p.hex}
              stroke={on ? '#fff' : '#00000066'}
              strokeWidth={on ? 2.5 : 1}
              className="cursor-pointer"
              onPointerEnter={() => setHover(p.code)}
              onPointerLeave={() => setHover(null)}
              onClick={() => onSelect(p.code)}
            />
          )
        })}
        {markers.map((m) => {
          const [x, y] = at(m.hex)
          return (
            <path key={m.label} d={`M${x} ${y - 12}L${x + 12} ${y}L${x} ${y + 12}L${x - 12} ${y}Z`} fill={m.hex} stroke="#fff" strokeWidth={2.5}>
              <title>{`${m.label} ${m.hex}`}</title>
            </path>
          )
        })}
      </svg>
      {info && <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/85 px-2 py-1 text-xs">{`${info.name} ${info.code} ${info.hex}`}</div>}
    </div>
  )
}
