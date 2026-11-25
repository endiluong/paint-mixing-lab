import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { paintBackground } from '@/lib/color'
import type { MetalSwatch, Paint } from '@/lib/types'
import { brandChoice } from './Filters'

export const OWNED_GREEN = '#1B7A3D'

/** Green pill: the paint is in the user's collection. */
export const OwnedTag = () => (
  <span className="inline-flex shrink-0 items-center gap-1 self-center rounded-[8px] px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: OWNED_GREEN }}>
    <Check size={12} strokeWidth={3.5} aria-hidden />
    Owned
  </span>
)

/** Short name and colour of each range. White text has at least 4.5 to 1 contrast on every one. */
export const RANGE_TAGS: Record<string, { label: string; color: string }> = {
  'Vallejo GameColor': { label: 'V GameColor', color: '#B3261E' },
  'Vallejo Color': { label: 'V Color', color: '#1F5FA8' },
  'Vallejo Squidmar': { label: 'V Squidmar', color: '#0F7568' },
  'AK Interactive': { label: 'AK', color: '#3F3F46' },
  Scale75: { label: 'Scale75', color: '#A34A07' },
  Citadel: { label: 'Citadel', color: '#5B3FA0' },
}
const OTHER_TAG = '#5A6472'

/** Pill with the range of a paint. */
export const RangeTag = ({ brand, line }: Pick<Paint, 'brand' | 'line'>) => {
  const choice = brandChoice({ brand, line })
  const tag = RANGE_TAGS[choice]
  return <span className="inline-block max-w-full shrink-0 truncate rounded-[8px] px-2 py-0.5 text-xs font-semibold text-white" style={{ background: tag?.color ?? OTHER_TAG }}>{tag?.label ?? choice}</span>
}

interface Props {
  hex: string | null
  metal?: MetalSwatch | null
  code: string
  name: string
  brand: string
  line: string
  owned: boolean
  selected?: boolean
  onClick?: () => void
  children?: ReactNode
}

/** A paint drawn like its bottle: colour on the left, off-white label strip with the code in bold. */
export const PaintLabel = ({ hex, metal, code, name, brand, line, owned, selected, onClick, children }: Props) => (
  <div className={`flex min-w-0 overflow-hidden rounded-md bg-label text-label-ink ${selected ? 'ring-2 ring-white' : ''}`}>
    <button type="button" onClick={onClick} disabled={!onClick} aria-pressed={selected} className="flex min-w-0 flex-1 items-stretch text-left focus-visible:-outline-offset-2 focus-visible:outline-black disabled:cursor-default disabled:opacity-100">
      <span className="w-11 shrink-0" style={{ background: paintBackground(hex, metal) }} />
      <span className="min-w-0 flex-1 px-2.5 py-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 truncate">{name}</span>
          {code && <span className="font-code shrink-0 text-[15px] font-bold">{code}</span>}
          {owned && <OwnedTag />}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2">
          <RangeTag brand={brand} line={line} />
          <span className="min-w-0 truncate text-xs text-label-dim">{line}</span>
        </span>
      </span>
    </button>
    {children}
  </div>
)
