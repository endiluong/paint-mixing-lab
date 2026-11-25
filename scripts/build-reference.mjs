// Rebuilds public/reference.json from the MIT-licensed miniature-paints dataset.
// Run: node scripts/build-reference.mjs
import { writeFile } from 'node:fs/promises'

const REPO = 'Arcturus5404/miniature-paints'
/** Colour systems, not paints you can buy as a bottle. */
const SKIP = new Set(['Pantone', 'RAL'])
const BRANDS = {
  AK: 'AK Interactive', AKRC: 'AK Interactive', Army_Painter: 'Army Painter', Citadel_Colour: 'Citadel', CoatDArmes: "Coat d'Arms",
  GreenStuffWorld: 'Green Stuff World', KimeraKolors: 'Kimera Kolors', MissionModels: 'Mission Models', MrHobby: 'Mr Hobby', MrPaint: 'Mr Paint',
  TurboDork: 'Turbo Dork', AppleBarrel: 'Apple Barrel', TomColor: 'Tom Color', Mig: 'Ammo by Mig', Duncan: 'Duncan', Creature: 'Creature Caster',
}

const tree = await (await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`)).json()
const files = tree.tree.map((t) => t.path).filter((p) => /^paints\/.+\.md$/.test(p))
const out = []
for (const path of files) {
  const key = path.slice(7, -3)
  if (SKIP.has(key)) continue
  const text = await (await fetch(`https://raw.githubusercontent.com/${REPO}/main/${path}`)).text()
  let columns = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells[0] === 'Name') {
      columns = cells
      continue
    }
    const hex = line.match(/`(#[0-9A-Fa-f]{6})`/)?.[1]
    if (!hex || columns.length === 0) continue
    const at = (name) => cells[columns.indexOf(name)] ?? ''
    out.push([BRANDS[key] ?? key.replace(/_/g, ' '), at('Name'), columns.includes('Code') ? at('Code') : '', columns.includes('Set') ? at('Set') : '', hex.toUpperCase()])
  }
}
await writeFile('public/reference.json', `[\n${out.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`)
console.log(`${out.length} paints from ${files.length - SKIP.size} files`)
