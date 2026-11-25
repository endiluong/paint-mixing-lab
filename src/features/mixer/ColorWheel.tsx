import { memo, useState } from 'react'
import { hexToLab, wheelPosition } from '@/lib/color'
import type { GraphPoint, GraphProps } from './bench'

const R = 200
const at = (hex: string): [number, number] => {
  const [x, y] = wheelPosition(hexToLab(hex))
  return [x * R, y * R]
}

interface DotsProps {
  points: GraphPoint[]
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

/** Kept apart from the highlight so that hovering does not redraw thousands of dots. */
const Dots = memo(({ points, onHover, onSelect }: DotsProps) => {
  const crowded = points.length > 400
  const ordered = crowded ? [...points].sort((a, b) => Number(a.owned) - Number(b.owned)) : points
  return (
    <g>
      {ordered.map((p) => {
        const [x, y] = at(p.hex)
        return (
          <circle
            key={p.id}
            cx={x}
            cy={y}
            r={crowded ? (p.owned ? 5 : 2.8) : 6}
            fill={p.hex}
            stroke="#00000066"
            strokeWidth={crowded ? 0.5 : 1}
            className="cursor-pointer"
            onPointerEnter={() => onHover(p.id)}
            onPointerLeave={() => onHover(null)}
            onClick={() => onSelect(p.id)}
          />
        )
      })}
    </g>
  )
})
Dots.displayName = 'Dots'

/** Seen from above: angle is hue, distance from the middle is saturation. Lightness is not shown. */
export const ColorWheel = ({ points, markers, selected, onSelect }: GraphProps) => {
  const [hover, setHover] = useState<string | null>(null)
  const info = points.find((p) => p.id === (hover ?? selected))
  const spot = info ? at(info.hex) : null
  return (
    <div className="relative h-full w-full">
      <svg viewBox="-225 -225 450 450" className="h-full w-full" role="img" aria-label={`Color wheel with ${points.length} paints`}>
        {[1, 0.66, 0.33].map((k) => <circle key={k} r={R * k} fill="none" stroke="#9a9a9a" strokeOpacity={k === 1 ? 0.6 : 0.25} />)}
        <path d={`M-${R} 0H${R}M0 -${R}V${R}`} stroke="#9a9a9a" strokeOpacity={0.2} />
        <Dots points={points} onHover={setHover} onSelect={onSelect} />
        {info && spot && <circle cx={spot[0]} cy={spot[1]} r={9} fill={info.hex} stroke="#fff" strokeWidth={2.5} pointerEvents="none" />}
        {markers.map((m) => {
          const [x, y] = at(m.hex)
          return (
            <path key={m.label} d={`M${x} ${y - 12}L${x + 12} ${y}L${x} ${y + 12}L${x - 12} ${y}Z`} fill={m.hex} stroke="#fff" strokeWidth={2.5}>
              <title>{`${m.label} ${m.hex}`}</title>
            </path>
          )
        })}
      </svg>
      {info && <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/85 px-2 py-1 text-xs">{[info.name, info.code, info.hex].filter(Boolean).join(' ')}</div>}
    </div>
  )
}
