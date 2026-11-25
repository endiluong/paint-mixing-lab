import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { inkOn, paintBackground } from '@/lib/color'
import type { MetalSwatch } from '@/lib/types'

/** Round check mark in the ink of the pill, so it shows on every colour. */
export const OwnedMark = ({ ink, paper }: { ink: string; paper: string }) => (
  <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: ink, color: paper }}>
    <Check size={12} strokeWidth={3.5} aria-hidden />
    <span className="sr-only">In your paints. </span>
  </span>
)

interface Props {
  hex: string | null
  metal?: MetalSwatch | null
  name: string
  code: string
  owned: boolean
  selected?: boolean
  title?: string
  onClick?: () => void
  /** Extra buttons inside the pill. */
  children?: ReactNode
}

const INNER = 'focus-visible:outline-current focus-visible:-outline-offset-3'
export const PILL_ACTION = `flex items-center rounded-r-[8px] px-2 hover:bg-current/15 ${INNER}`

/** A paint as a pill filled with its own colour. A check mark means the user owns it. */
export const PaintPill = ({ hex, metal, name, code, owned, selected, title, onClick, children }: Props) => {
  const paper = hex ?? '#3A3A3A'
  const ink = inkOn(paper)
  const body = (
    <>
      {owned && <OwnedMark ink={ink} paper={paper} />}
      <span className="min-w-0 truncate">{name}</span>
      {code && <span className="font-code shrink-0 font-bold">{code}</span>}
    </>
  )
  const inner = 'flex min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-left'
  return (
    <span
      className={`inline-flex max-w-full items-stretch rounded-[8px] text-sm ring-inset ${selected ? 'outline-2 outline-offset-2 outline-white' : ''} ${hex ? 'ring-1 ring-white/20' : 'border border-dashed border-dim'}`}
      style={{ background: paper, color: ink }}
      title={title}
    >
      {metal && <span className="w-7 shrink-0 rounded-l-[8px]" style={{ background: paintBackground(hex, metal) }} />}
      {onClick ? <button type="button" aria-pressed={selected} onClick={onClick} className={`${inner} rounded-[8px] ${INNER}`}>{body}</button> : <span className={inner}>{body}</span>}
      {children}
    </span>
  )
}
