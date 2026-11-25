export interface MixItem {
  code: string
  parts: number
}

export interface LayerItem {
  id: string
  /** A paint code, or "mix" for whatever is on the mixing bench. */
  source: string
  opacity: number
}

export interface LayerState {
  base: string
  layers: LayerItem[]
}

export interface SavedSwatch {
  id: string
  kind: 'mix' | 'layer'
  hex: string
  /** Colours to show from bottom to top; a mix has one. */
  steps: string[]
  recipe: string
}

export type BenchMode = 'mix' | 'layer' | 'match' | 'saved'

export const MAX_MIX = 4
export const MAX_LAYERS = 6

export interface Marker {
  hex: string
  label: string
}

export interface GraphPoint {
  code: string
  name: string
  hex: string
}

export interface GraphProps {
  points: GraphPoint[]
  markers: Marker[]
  selected: string | null
  onSelect: (code: string | null) => void
}
