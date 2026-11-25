// Builds public/library.json: every normal acrylic from the open dataset, the Vallejo charts and the Scale75 wiki list.
// Run after build-reference.mjs: node scripts/build-library.mjs
import { readFile, writeFile } from 'node:fs/promises'

const json = async (path) => JSON.parse(await readFile(path, 'utf8'))
const reference = await json('public/reference.json')
const charts = await json('data/vallejo-charts.json')
const wiki = await json('data/scale75-wiki.json')
const squidmar = await json('src/data/squidmar.json')
const owned = await json('src/data/paints.json')

const BRANDS = new Set(['Vallejo', 'AK Interactive', 'Citadel', 'Scale75'])
/** Other mediums, sprays and lines that are not bottles of ordinary acrylic. */
const SKIP_SET = /real colors|spray|hobby paint|primer|discontinued|technical|fluo|metal|xpress|contrast|\bink|wash|shade|glaz|clear|fx|weathering|auxiliary|soil|alchemy|instant|liquid gold|intens|transparent|general/i
const SKIP_NAME = /\b(medium|varnish|thinner|retarder|mask|putty|primer|gold|silver|copper|bronze|brass|steel|chrome|aluminium|gunmetal|gun metal|pewter|platinum|metallic|metal|iron|fluorescent|neon)\b/i
const KEEP_NAME = /\b(yellow|gr[ae]y|brown|flesh|red|blue|green|white|black)\b/i
const skipName = (name) => /fluo|neon|phosphor|metallic|varnish|medium/i.test(name) || (SKIP_NAME.test(name) && !KEEP_NAME.test(name))

const plain = (s) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/grey/g, 'gray').replace(/[^a-z0-9]+/g, ' ').trim()
const toLab = (hex) => {
  const f = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [1, 3, 5].map((i) => f(parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

const WORDS = [
  [/\b(flesh|skin|skintone)\b/, 'Skin / Flesh'],
  [/\b(turquoise|aquamarine|teal)\b/, 'Turquoise'],
  [/\b(magenta|pink|rose)\b/, 'Magenta / Pink'],
  [/\b(purple|violet|lilac|lavender)\b/, 'Purple / Violet'],
  [/\b(white|ivory)\b/, 'White'],
  [/\b(black)\b/, 'Black'],
  [/\b(gr[ae]y|charcoal)\b/, 'Grey'],
  [/\b(brown|umber|sienna|rust|leather|sand|buff|tan|khaki|beige|earth|mud|wood)\b/, 'Brown'],
  [/\b(orange|peach)\b/, 'Orange'],
  [/\b(yellow|ochre)\b/, 'Yellow'],
  [/\b(green|olive)\b/, 'Green'],
  [/\b(blue|ultramarine)\b/, 'Blue'],
  [/\b(red|crimson|scarlet|vermilion|burgundy)\b/, 'Red'],
]

/** The last colour word in the name decides; without one, the swatch does. */
const groupOf = (name, hex) => {
  const n = plain(name)
  let best = null
  for (const [re, group] of WORDS) {
    const at = [...n.matchAll(new RegExp(re, 'g'))].pop()?.index
    if (at !== undefined && (!best || at > best.at)) best = { at, group }
  }
  if (best) return best.group
  const [L, a, b] = toLab(hex)
  const c = Math.hypot(a, b)
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
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

const ownedCodes = new Set(owned.map((p) => `${p.brand}|${p.code}`))
const ownedScale = new Set(owned.filter((p) => p.brand === 'Scale75').map((p) => plain(p.name)))
const out = new Map()
const add = (brand, set, code, name, hex, source) => {
  if (code && ownedCodes.has(`${brand}|${code}`)) return
  if (brand === 'Scale75' && /artist/i.test(set) && ownedScale.has(plain(name))) return
  const id = `${brand}|${code || `${set}|${plain(name)}`}`
  if (!out.has(id)) out.set(id, [id, brand, set, code, name, hex, groupOf(name, hex), source])
}

for (const p of squidmar) if (p.set === 'Squidmar Color') add('Vallejo', p.set, p.code, p.name, p.hex, 'Vallejo Squidmar chart')
for (const [code, p] of Object.entries(charts)) {
  if (p.sweep || skipName(p.name)) continue
  const ref = reference.find((r) => r[0] === 'Vallejo' && r[2] === code)
  if (ref && SKIP_SET.test(ref[3])) continue
  const model = code.startsWith('70')
  add('Vallejo', model ? 'Model Color' : 'Game Color', code, p.name, p.hex, model ? 'Vallejo Model Color chart' : 'Vallejo Game Color chart')
}
for (const [brand, name, code, set, hex] of reference) {
  if (!BRANDS.has(brand) || SKIP_SET.test(set) || skipName(name)) continue
  add(brand, set.replace(/\s+/g, ' '), code, name, hex, 'miniature-paints dataset')
}
for (const [code, p] of Object.entries(wiki)) {
  if (![...out.values()].some((r) => r[1] === 'Scale75' && plain(r[4]) === plain(p.name))) add('Scale75', 'Artist Range', code, p.name, p.hex, 'Hobby-Paints-Wiki')
}

// The official chart replaces dataset values for Vallejo paints (it fixes the metallics, which the dataset samples on a highlight).
const fixed = reference.map((r) => (r[0] === 'Vallejo' && charts[r[2]] && !charts[r[2]].sweep ? [r[0], r[1], r[2], r[3], charts[r[2]].hex] : r))
await writeFile('public/reference.json', `[\n${fixed.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`)

const rows = [...out.values()]
await writeFile('public/library.json', `[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`)
const count = (i) => Object.entries(rows.reduce((m, r) => ({ ...m, [r[i]]: (m[r[i]] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ')
console.log(rows.length, '|', count(1), '|', count(7))
console.log(count(2))
console.log(count(6))
