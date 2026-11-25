import { chroma, hexToLab, hue } from './color'

/** Same rules as scripts/build-library.mjs. */
const WORDS: [RegExp, string][] = [
  [/\b(flesh|skin|skintone)\b/g, 'Skin / Flesh'],
  [/\b(turquoise|aquamarine|teal)\b/g, 'Turquoise'],
  [/\b(magenta|pink|rose)\b/g, 'Magenta / Pink'],
  [/\b(purple|violet|lilac|lavender)\b/g, 'Purple / Violet'],
  [/\b(white|ivory)\b/g, 'White'],
  [/\b(black)\b/g, 'Black'],
  [/\b(gr[ae]y|charcoal)\b/g, 'Grey'],
  [/\b(brown|umber|sienna|rust|leather|sand|buff|tan|khaki|beige|earth|mud|wood)\b/g, 'Brown'],
  [/\b(orange|peach)\b/g, 'Orange'],
  [/\b(yellow|ochre)\b/g, 'Yellow'],
  [/\b(green|olive)\b/g, 'Green'],
  [/\b(blue|ultramarine)\b/g, 'Blue'],
  [/\b(red|crimson|scarlet|vermilion|burgundy)\b/g, 'Red'],
]

const groupOfHex = (hex: string): string => {
  const lab = hexToLab(hex)
  const { L } = lab
  const c = chroma(lab)
  const h = hue(lab)
  if (c < 0.03) return L > 0.9 ? 'White' : L < 0.25 ? 'Black' : 'Grey'
  if (h < 15 || h >= 345) return L > 0.65 ? 'Magenta / Pink' : 'Red'
  if (h < 45) return L < 0.4 && c < 0.08 ? 'Brown' : L > 0.72 ? 'Skin / Flesh' : 'Red'
  if (h < 75) return L < 0.62 && c < 0.13 ? 'Brown' : L > 0.75 && c < 0.1 ? 'Skin / Flesh' : 'Orange'
  if (h < 112) return L < 0.6 ? 'Brown' : 'Yellow'
  if (h < 160) return 'Green'
  if (h < 220) return 'Turquoise'
  if (h < 285) return 'Blue'
  if (h < 325) return 'Purple / Violet'
  return 'Magenta / Pink'
}

/** The last colour word in the name decides; without one, the swatch does. Null when neither says anything. */
export const guessGroup = (name: string, hex: string | null): string | null => {
  const n = name.toLowerCase()
  let best: { at: number; group: string } | null = null
  for (const [re, group] of WORDS) {
    const at = [...n.matchAll(re)].pop()?.index
    if (at !== undefined && (!best || at > best.at)) best = { at, group }
  }
  return best?.group ?? (hex ? groupOfHex(hex) : null)
}
