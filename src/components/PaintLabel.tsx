import type { ReactNode } from 'react'
import { paintBackground } from '@/lib/color'
import type { MetalSwatch } from '@/lib/types'

interface Props {
  hex: string | null
  metal?: MetalSwatch | null
  code: string
  name: string
  sub?: string
  selected?: boolean
  onClick?: () => void
  children?: ReactNode
}

/** A paint drawn like its bottle: colour on the left, off-white label strip with the code in bold. */
export const PaintLabel = ({ hex, metal, code, name, sub, selected, onClick, children }: Props) => (
  <div className={`flex min-w-0 overflow-hidden rounded-md bg-label text-label-ink ${selected ? 'ring-2 ring-white' : ''}`}>
    <button type="button" onClick={onClick} disabled={!onClick} className="flex min-w-0 flex-1 items-stretch text-left disabled:cursor-default disabled:opacity-100">
      <span className="w-11 shrink-0" style={{ background: paintBackground(hex, metal) }} />
      <span className="min-w-0 flex-1 px-2.5 py-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 truncate">{name}</span>
          <span className="font-code shrink-0 text-[15px] font-bold">{code}</span>
        </span>
        {sub && <span className="block truncate text-xs text-label-dim">{sub}</span>}
      </span>
    </button>
    {children}
  </div>
)
