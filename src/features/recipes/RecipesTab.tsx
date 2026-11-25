import { useMemo, useState } from 'react'
import { ExternalLink, FileUp, FlaskConical, Trash2 } from 'lucide-react'
import type { MixItem } from '@/features/mixer/bench'
import { usePersisted } from '@/hooks/usePersisted'
import { closeness } from '@/lib/color'
import { closestPaints, findMixes } from '@/lib/match'
import { findOwned, parseRecipePage, parseRecipeText, stepRatio, type ImportedRecipe, type PaintRef, type RecipeStep } from '@/lib/recipe'
import { isUsable } from '@/lib/paints'
import type { Paint, UsablePaint } from '@/lib/types'

interface Props {
  paints: Paint[]
  usable: UsablePaint[]
  sendToMixer: (items: MixItem[]) => void
}

interface Resolved {
  ref: PaintRef
  owned: Paint | null
  nearest: { paint: UsablePaint; distance: number } | null
  mix: string
}

const resolve = (ref: PaintRef, paints: Paint[], usable: UsablePaint[]): Resolved => {
  const owned = findOwned(ref, paints)
  if (owned || !ref.hex) return { ref, owned, nearest: null, mix: '' }
  const nearest = closestPaints(ref.hex, usable, 1)[0] ?? null
  const best = findMixes(ref.hex, usable, 2, 1)[0]
  const mix = best && nearest && best.distance < nearest.distance * 0.7 ? best.items.map((i) => `${i.parts} ${i.paint.name} ${i.paint.code}`).join(' + ') : ''
  return { ref, owned, nearest, mix }
}

export const RecipesTab = ({ paints, usable, sendToMixer }: Props) => {
  const [recipes, setRecipes] = usePersisted<ImportedRecipe[]>('pml.recipes', [])
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const current = adding ? null : (recipes.find((r) => r.id === openId) ?? recipes[0] ?? null)

  const resolved = useMemo(() => new Map((current?.paints ?? []).map((p) => [p.key, resolve(p, paints, usable)])), [current, paints, usable])
  const ownedCount = [...resolved.values()].filter((r) => r.owned).length

  const accept = (recipe: ImportedRecipe | null, why: string): void => {
    if (!recipe) return setError(why)
    setRecipes((prev) => [recipe, ...prev.filter((r) => r.id !== recipe.id)])
    setOpenId(recipe.id)
    setAdding(false)
    setText('')
    setLink('')
    setError('')
  }
  const importText = (): void => {
    if (text.includes('data-recipe-page-props')) return accept(parseRecipePage(text), 'This page could not be read. Save the recipe page again and choose the .html file.')
    accept(parseRecipeText(text, paints, link.trim()), 'Write a title on the first line and at least one step below it.')
  }
  const importFile = async (file: File): Promise<void> => {
    const content = await file.text()
    accept(parseRecipePage(content), 'No recipe found in this file. In your browser, open the recipe on Paint Pad, press Ctrl+S and choose that .html file here.')
  }
  const toMixer = (step: RecipeStep): MixItem[] => {
    const ratio = stepRatio(step.parts)
    return step.parts.flatMap((p) => (typeof p === 'string' ? [] : [p.ref])).flatMap((key, n) => {
      const r = resolved.get(key)
      const paint = r?.owned && isUsable(r.owned) ? r.owned : (r?.nearest?.paint ?? null)
      return paint ? [{ code: paint.id, parts: ratio?.[n] || 1 }] : []
    }).filter((item, n, all) => all.findIndex((x) => x.code === item.code) === n)
  }

  return (
    <div className="grid min-h-0 lg:h-full lg:grid-cols-[300px_1fr]">
      <aside className="flex min-h-0 flex-col gap-3 border-line p-4 lg:border-r">
        <button type="button" className="btn-main" onClick={() => { setAdding(true); setError('') }}><FileUp size={16} />Load a recipe</button>
        <ul className="scroll grid content-start gap-1 overflow-y-auto">
          {recipes.map((r) => (
            <li key={r.id}>
              <button type="button" aria-pressed={current?.id === r.id} onClick={() => { setOpenId(r.id); setAdding(false) }} className={`w-full rounded-md px-3 py-2 text-left ${current?.id === r.id ? 'bg-raised' : 'hover:bg-panel'}`}>
                <span className="block truncate font-medium">{r.title}</span>
                <span className="block truncate text-xs text-dim">{r.author ? `by ${r.author}, ` : ''}{r.paints.length} paints</span>
              </button>
            </li>
          ))}
        </ul>
        <a className="mt-auto inline-flex items-center gap-1.5 text-sm text-dim underline hover:text-text" href="https://paintpad.app/recipes" target="_blank" rel="noreferrer">Browse recipes on Paint Pad<ExternalLink size={13} /></a>
      </aside>

      <section className="scroll min-h-0 overflow-y-auto p-5">
        {adding || !current ? (
          <div className="max-w-2xl">
            <h2 className="mb-4 text-xl font-semibold">Load a recipe</h2>
            <h3 className="font-semibold">From Paint Pad</h3>
            <p className="mb-2 mt-1 text-dim">Open the recipe in your browser, press Ctrl+S to save the page, then choose the .html file. Paint names, colors and steps come in exactly, with the author's name and link.</p>
            <label className="btn mb-6 cursor-pointer"><FileUp size={16} />Choose saved page<input type="file" accept=".html,.htm,text/html" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = '' }} /></label>
            <h3 className="font-semibold">Write or paste your own</h3>
            <p className="mb-2 mt-1 text-dim">Title on the first line, one step per line. End a line with a colon to make it a heading. Your paints are recognised by code or name.</p>
            <textarea className="field h-44 w-full" aria-label="Recipe text" placeholder={'Dark red cloak\nBase:\nBasecoat 72.111\nHighlight 2:1 Gory Red and 72.009'} value={text} onChange={(e) => setText(e.target.value)} />
            <input className="field mt-2 w-full" aria-label="Link to the source" placeholder="Link to the source (optional)" value={link} onChange={(e) => setLink(e.target.value)} />
            {error && <p role="alert" className="mt-3 rounded-md border border-line bg-raised px-3 py-2">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn-main" disabled={!text.trim()} onClick={importText}>Add recipe</button>
              {recipes.length > 0 && <button type="button" className="btn" onClick={() => { setAdding(false); setError('') }}>Cancel</button>}
            </div>
            <p className="mt-6 text-sm text-dim">Recipes stay in this browser. They belong to their authors, so keep them for your own painting and link back when you share.</p>
          </div>
        ) : (
          <article className="max-w-4xl">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold">{current.title}</h2>
                <p className="text-sm text-dim">{current.author && `by ${current.author}. `}{current.source && <a className="underline hover:text-text" href={current.source} target="_blank" rel="noreferrer">Open the original</a>}</p>
              </div>
              <button type="button" className="btn" onClick={() => { setRecipes((prev) => prev.filter((r) => r.id !== current.id)); setOpenId(null) }}><Trash2 size={15} />Delete</button>
            </div>

            <h3 className="mb-2 mt-5 text-sm text-dim">Paints: you own {ownedCount} of {current.paints.length}</h3>
            <ul className="grid gap-1.5 md:grid-cols-2">
              {[...resolved.values()].map(({ ref, owned, nearest, mix }) => (
                <li key={ref.key} className="flex gap-3 rounded-md bg-panel p-2">
                  <span className="flex h-11 w-16 shrink-0 overflow-hidden rounded">
                    <span className="flex-1" style={{ background: ref.hex ?? '#555' }} />
                    {!owned && nearest && <span className="flex-1" style={{ background: nearest.paint.hex }} />}
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block">{ref.name} <span className="font-code text-dim">{ref.code}</span></span>
                    {owned ? <span className="block font-semibold">You own this</span> : nearest ? (
                      <span className="block text-dim">Use {nearest.paint.name} {nearest.paint.code}, {closeness(nearest.distance)}{mix && <>. Closer: {mix}</>}</span>
                    ) : <span className="block text-dim">Not in your list, and the recipe gives no color for it</span>}
                  </span>
                </li>
              ))}
            </ul>

            <h3 className="mb-2 mt-6 text-sm text-dim">Method</h3>
            <div className="grid gap-2">
              {current.steps.map((step, i) =>
                step.kind === 'heading' ? (
                  <h4 key={i} className="mt-3 text-base font-semibold">{step.parts.filter((p) => typeof p === 'string').join('')}</h4>
                ) : (
                  <div key={i} className="flex items-start gap-3 rounded-md bg-panel px-3 py-2">
                    <p className="min-w-0 flex-1 leading-7">
                      {step.parts.map((p, n) => {
                        if (typeof p === 'string') return <span key={n}>{p}</span>
                        const r = resolved.get(p.ref)
                        return (
                          <span key={n} className="mx-0.5 inline-flex items-center gap-1.5 rounded bg-label px-1.5 text-label-ink">
                            <span className="h-3.5 w-3.5 rounded-sm" style={{ background: r?.ref.hex ?? '#888' }} />
                            {r?.ref.name ?? p.ref}
                          </span>
                        )
                      })}
                    </p>
                    {toMixer(step).length >= 2 && <button type="button" className="btn shrink-0" onClick={() => sendToMixer(toMixer(step))}><FlaskConical size={15} />Try in mixer</button>}
                  </div>
                ),
              )}
            </div>
          </article>
        )}
      </section>
    </div>
  )
}
