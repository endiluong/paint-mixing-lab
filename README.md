# Paint Mixing Lab


Color mixing for the paints you own. Built from a 193-paint inventory read from bottle labels.

## Run

```bash
npm install
npm run dev      # development
npm test         # color model, recipe import and inventory tests
npm run build    # production build in dist/
```

## Tabs

- **Mixer**: 60/40 screen. Left is the color graph (3D sphere or 2D wheel) with the bench below it. Right is the list of paints in the graph, filtered by color group, type and brand. A toggle switches between the paints you own and every normal paint in the library (Vallejo with Squidmar Color, AK, Citadel, Scale75).
  - *Mix*: 2, 3 or 4 paints in parts, with test swatches for common ratios.
  - *Layer*: a base coat and up to six coats, each with its own opacity.
  - *Match a color*: the closest paints you own and the best 2 or 3 paint mixes for a target.
  - *Swatches*: saved tests.
- **Recipes**: load a recipe page you saved from Paint Pad, or write your own. Shows which paints you own and what to use instead.
- **Buy check**: paste a shopping list (code, brand, name or hex). Tells you if you own it, if it duplicates a color you have, if you can mix it, or if it fills a gap.
- **Inventory**: every paint with its hex, hex sources, label photo and details. Change a hex, the tint strength or the hiding power, tick paints as checked, export CSV.

Only normal acrylics are in the graph. Xpress, metal, ink, fluo, Quick Gen, Special FX and "Intense" paints can be added one by one with "In mixer" in the Inventory.

## How colors are calculated

- Mixing: Kubelka-Munk on 38-band reflectance curves rebuilt from each hex (`spectral.js`), weighted by parts, tint strength and luminance.
- Layering: one Kubelka-Munk film per coat. Opacity is how much of a black/white lightness contrast the coat hides.
- Sphere and matching: OKLab.

A hex does not contain a paint's pigments, so results are estimates. Test on real paint, then adjust tint strength and hiding power in the Inventory.

## Data

| File | Content |
|---|---|
| `src/data/paints.json` | Inventory, with hex from [miniature-paints](https://github.com/Arcturus5404/miniature-paints) (MIT, (c) 2022 Rick Fleuren, see THIRD_PARTY_NOTICES.md) and Hobby-Paints-Wiki |
| `src/data/paintpad-hex.json` | Preferred hex values from [Paint Pad](https://paintpad.app/paints). Not committed: their terms allow viewing only |
| `src/data/tmm.json` | Vallejo True Metallic Metal swatches (body, highlight, shadow, gradient) measured from chart CC339 |
| `public/library.json` | Normal paints you do not own, for the Mixer toggle. Rebuild with `node scripts/build-library.mjs` |
| `data/vallejo-charts.json`, `src/data/squidmar.json` | Color values measured from the Vallejo Model Color, Game Color and Squidmar Color charts |
| `data/scale75-wiki.json` | Scale75 list from Hobby-Paints-Wiki |
| `public/reference.json` | 9,909 paints from miniature-paints for Buy check. Rebuild with `node scripts/build-reference.mjs` |
| `public/labels/` | Label photos for cross-checking |

Recipes, changes and swatches are kept in the browser only. Recipes belong to their authors.
