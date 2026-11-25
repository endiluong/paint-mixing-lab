export interface PaintRecord {
  code: string
  name: string
  brand: string
  line: string
  type: string
  detail: string
  group: string
  openHex: string | null
  wikiHex: string | null
  /** Ordinary opaque acrylic. Xpress, Metal, Ink, Fluo, Quick Gen, Special FX and "Intense" paints are false. */
  normal: boolean
  seen: string
  nameSource: string
  score: number
  confirmed: boolean
}

/** What the user changed for one paint. Stored in the browser only. */
export interface PaintOverride {
  hex?: string
  strength?: number
  hiding?: number
  inMixer?: boolean
  checked?: boolean
}

export interface Paint extends PaintRecord {
  hex: string | null
  hexSource: string
  /** Other reference values for the same code, for cross-checking. */
  references: { hex: string; source: string }[]
  /** Largest OKLab distance between the hex in use and a reference. */
  gap: number
  strength: number
  hiding: number
  inMixer: boolean
  checked: boolean
}

export interface UsablePaint extends Paint {
  hex: string
}

export interface MixPart {
  hex: string
  parts: number
  strength: number
}
