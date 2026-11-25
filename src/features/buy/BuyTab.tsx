import { useEffect, useMemo, useState } from 'react'
import { Crosshair, FlaskConical, Heart, X } from 'lucide-react'
import type { MixItem } from '@/features/mixer/bench'
import { usePersisted } from '@/hooks/usePersisted'
import { checkPaint, DUPLICATE, FINISH_LABEL, finishOf, loadReference, lookup, parseQuery, type Candidate, type Finish, type Lookup, type Query, type RefPaint, type Verdict, type VerdictKind } from '@/lib/buyCheck'
import { closeness, hexToLab, inkOn, isHex, labDistance, paintBackground } from '@/lib/color'
import type { MetalSwatch, Paint } from '@/lib/types'

interface Props {
  paints: Paint[]
  sendToMixer: (items: MixItem[]) => void
  showOnGraph: (hex: string) => void
}

interface Choice {
  index: number
  hex?: string
  finish?: Finish
}

const HEADLINE: Record<VerdictKind, string> = {
  own: 'You own it',
  duplicate: 'Duplicate color',
  close: 'Very close to one you own',
  mix: 'You can mix it',
  gap: 'Fills a gap',
}

const MAX_LINES = 60

const nameOf = (c: Candidate): string => [c.brand, c.name, c.code].filter(Boolean).join(' ')

const toCandidate = (q: Query, hit: Lookup | undefined, choice: Choice): Candidate | null => {
  const typedHex = choice.hex && isHex(choice.hex) ? choice.hex.toUpperCase() : q.hex
  if (!hit && !typedHex) return null
  return {
    title: q.raw,
    brand: hit?.ref.brand ?? q.brand,
    code: hit?.ref.code || q.code,
    name: hit?.ref.name ?? q.name,
    hex: typedHex ?? hit?.ref.hex ?? '#000000',
    finish: choice.finish ?? (hit ? finishOf(hit.ref.set, hit.ref.name) : 'normal'),
    metal: typedHex ? null : hit?.ref.metal,
    origin: typedHex ? 'typed' : 'open',
  }
}

export const BuyTab = ({ paints, sendToMixer, showOnGraph }: Props) => {
  const [refs, setRefs] = useState<RefPaint[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [text, setText] = usePersisted('pml.buy', '')
  const [lines, setLines] = usePersisted<string[]>('pml.buy.lines', [])
  const [choices, setChoices] = usePersisted<Record<string, Choice>>('pml.buy.choices', {})
  const [wish, setWish] = usePersisted<Candidate[]>('pml.wish', [])

  useEffect(() => {
    let live = true
    loadReference(`${import.meta.env.BASE_URL}reference.json`).then((r) => live && setRefs(r)).catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  const rows = useMemo(
    () =>
      lines.map((raw) => {
        const q = parseQuery(raw)
        const hits = refs ? lookup(q, refs) : []
        const choice = choices[raw] ?? { index: 0 }
        const hit = hits[choice.index]
        const candidate = toCandidate(q, hit, choice)
        return { raw, q, hits, hit, choice, candidate, verdict: candidate ? checkPaint(candidate, paints) : null }
      }),
    [lines, refs, choices, paints],
  )
  const choose = (raw: string, patch: Partial<Choice>): void => setChoices((prev) => ({ ...prev, [raw]: { ...(prev[raw] ?? { index: 0 }), ...patch } }))
  const run = (): void => setLines([...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))].slice(0, MAX_LINES))
  const counts = rows.reduce<Partial<Record<VerdictKind, number>>>((m, r) => (r.verdict ? { ...m, [r.verdict.kind]: (m[r.verdict.kind] ?? 0) + 1 } : m), {})

  return (
    <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] lg:h-full lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="scroll flex min-h-0 flex-col gap-3 overflow-y-auto border-line p-4 lg:border-r">
        <h2 className="text-base font-semibold">Will it be a duplicate?</h2>
        <p className="text-sm text-dim">One paint per line: code, brand and name, in any order. Add a hex like #C8202F if you know it.</p>
        <textarea
          className="field h-40 w-full"
          aria-label="Paints to check"
          placeholder={'72.010\nCitadel Mephiston Red\nAK11049\nMystery red #C8202F'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run()
          }}
        />
        <button type="button" className="btn-main" disabled={!text.trim() || (!refs && !failed)} onClick={run}>{refs || failed ? 'Check' : 'Loading paint data'}</button>
        {failed && <p role="alert" className="rounded-md bg-raised px-3 py-2 text-sm">The paint data did not load. Reload the page, or add a hex to each line.</p>}
        {refs && <p className="text-xs text-dim tnum">Looks in {refs.length.toLocaleString('en')} paints from many brands.</p>}

        <h3 className="mt-3 text-sm font-semibold">Wishlist {wish.length > 0 && <span className="text-dim tnum">{wish.length}</span>}</h3>
        {wish.length === 0 ? <p className="text-sm text-dim">Paints you save appear here.</p> : (
          <ul className="grid gap-1.5">
            {wish.map((w) => (
              <li key={nameOf(w) + w.hex} className="flex items-center gap-2 text-sm">
                <span className="h-7 w-9 shrink-0 rounded" style={{ background: w.hex }} />
                <span className="min-w-0 flex-1 truncate">{nameOf(w) || w.title}</span>
                <button type="button" className="p-1 text-dim hover:text-text" aria-label={`Remove ${nameOf(w)} from wishlist`} onClick={() => setWish((prev) => prev.filter((x) => x !== w))}><X size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="scroll min-h-0 min-w-0 overflow-y-auto p-4 sm:p-5" aria-label="Results">
        {rows.length === 0 ? (
          <div className="max-w-xl text-dim">
            <p>Results compare each paint with yours of the same finish, so a metallic is never matched to a flat paint.</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-dim">{(Object.keys(HEADLINE) as VerdictKind[]).filter((k) => counts[k]).map((k) => `${HEADLINE[k]}: ${counts[k]}`).join('. ')}</p>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
              {rows.map((r, n) => {
                const twin = r.candidate
                  ? (rows.slice(0, n).find((o) => o.candidate && o.candidate.finish === r.candidate?.finish && labDistance(hexToLab(o.candidate.hex), hexToLab(r.candidate.hex)) < DUPLICATE)?.candidate ??
                    wish.find((w) => nameOf(w) !== nameOf(r.candidate as Candidate) && w.finish === r.candidate?.finish && labDistance(hexToLab(w.hex), hexToLab((r.candidate as Candidate).hex)) < DUPLICATE) ??
                    null)
                  : null
                return (
                  <li key={r.raw}>
                    <Result
                      {...r}
                      twin={twin}
                      wished={wish.some((w) => r.candidate !== null && nameOf(w) === nameOf(r.candidate) && w.hex === r.candidate.hex)}
                      choose={(patch) => choose(r.raw, patch)}
                      save={() => r.candidate && setWish((prev) => [r.candidate as Candidate, ...prev])}
                      sendToMixer={sendToMixer}
                      showOnGraph={showOnGraph}
                    />
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

interface ResultProps {
  raw: string
  q: Query
  hits: Lookup[]
  hit: Lookup | undefined
  choice: Choice
  candidate: Candidate | null
  verdict: Verdict | null
  twin: Candidate | null
  wished: boolean
  choose: (patch: Partial<Choice>) => void
  save: () => void
  sendToMixer: (items: MixItem[]) => void
  showOnGraph: (hex: string) => void
}

const Result = ({ raw, q, hits, hit, choice, candidate, verdict, twin, wished, choose, save, sendToMixer, showOnGraph }: ResultProps) => {
  const nearest = verdict?.kind === 'own' ? null : (verdict?.neighbours[0] ?? null)
  const mix = verdict?.mixes[0] ?? null
  return (
    <article className="overflow-hidden rounded-lg bg-panel">
      <div className="flex flex-col sm:flex-row">
        <div className="flex h-28 shrink-0 sm:h-auto sm:min-h-40 sm:w-64">
          {candidate && verdict ? (
            <>
              {verdict.owned ? <Swatch hex={verdict.owned.hex ?? candidate.hex} metal={verdict.owned.metal} label="Yours" /> : <Swatch hex={candidate.hex} metal={candidate.metal} label="To buy" />}
              {!verdict.owned && verdict.kind === 'mix' && mix && <Swatch hex={mix.hex} label="Your mix" />}
              {!verdict.owned && verdict.kind !== 'mix' && nearest && <Swatch hex={nearest.hex} metal={nearest.paint.metal} label={verdict.kind === 'gap' ? 'Nearest' : 'Yours'} />}
            </>
          ) : <span className="flex-1" style={{ background: 'repeating-linear-gradient(45deg,#444 0 8px,#4e4e4e 8px 16px)' }} />}
        </div>
        <div className="min-w-0 flex-1 p-4">
          <h3 className="text-lg font-semibold">{verdict ? HEADLINE[verdict.kind] : 'Not found'}</h3>
          <p className="text-sm text-dim">{candidate ? `${nameOf(candidate) || raw}, ${verdict?.owned?.hex ?? candidate.hex}, ${FINISH_LABEL[candidate.finish]}` : raw}</p>

          {verdict?.kind === 'own' && verdict.owned && <p className="mt-2">{verdict.owned.name} <span className="font-code font-bold">{verdict.owned.code}</span> is in your inventory.</p>}
          {verdict && nearest && (
            <p className="mt-2">
              {verdict.kind === 'gap' || verdict.kind === 'mix' ? 'Nearest of yours: ' : ''}{nearest.paint.name} <span className="font-code font-bold">{nearest.paint.code}</span> ({nearest.paint.brand}), {closeness(nearest.distance)}.
              {verdict.neighbours.length > 1 && <span className="text-dim"> Then {verdict.neighbours.slice(1, 3).map((x) => `${x.paint.name} ${x.paint.code}`).join(', ')}.</span>}
            </p>
          )}
          {verdict && !verdict.owned && verdict.neighbours.length === 0 && candidate && <p className="mt-2">You own no {FINISH_LABEL[candidate.finish]} to compare with.</p>}
          {verdict?.kind === 'mix' && mix && <p className="mt-1">Mix {mix.items.map((i) => `${i.parts} ${i.paint.name} ${i.paint.code}`).join(' + ')}.</p>}
          {verdict?.depends && <p className="mt-2 rounded-md bg-raised px-3 py-2 text-sm">Check in person. Other hex sources for your paint would change this answer.</p>}
          {verdict && !verdict.owned && candidate && candidate.finish !== 'normal' && !candidate.metal && <p className="mt-2 rounded-md bg-raised px-3 py-2 text-sm">A hex shows this finish poorly, so treat this as a hint.</p>}
          {twin && <p className="mt-2 rounded-md bg-raised px-3 py-2 text-sm">Nearly identical to {nameOf(twin) || twin.title}, also on your list.</p>}
          {hit && !hit.exact && !choice.hex && <p className="mt-2 rounded-md bg-raised px-3 py-2 text-sm">Is this the right paint? {hit.why[0].toUpperCase() + hit.why.slice(1)}.</p>}
          {!candidate && <p className="mt-2">{q.code ? `No paint with code ${q.code} in the data.` : 'No paint with this name in the data.'} Type its hex to compare the color.</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {hits.length > 1 && (
              <select className="field max-w-full" aria-label={`Which paint for ${raw}`} value={choice.index} onChange={(e) => choose({ index: Number(e.target.value), hex: undefined, finish: undefined })}>
                {hits.map((h, i) => <option key={i} value={i}>{[h.ref.brand, h.ref.name, h.ref.code, h.ref.set && `(${h.ref.set})`].filter(Boolean).join(' ')}</option>)}
              </select>
            )}
            <input className="field w-28 tnum" aria-label={`Hex for ${raw}`} placeholder="Other hex" defaultValue={choice.hex ?? q.hex ?? ''} onChange={(e) => choose({ hex: e.target.value.startsWith('#') || !e.target.value ? e.target.value : `#${e.target.value}` })} />
            {candidate && (
              <>
                <select className="field max-w-full" aria-label={`Finish of ${raw}`} value={candidate.finish} onChange={(e) => choose({ finish: e.target.value as Finish })}>
                  {(Object.keys(FINISH_LABEL) as Finish[]).map((f) => <option key={f} value={f}>{FINISH_LABEL[f]}</option>)}
                </select>
                <button type="button" className="btn" disabled={wished || verdict?.kind === 'own'} onClick={save}><Heart size={15} />{wished ? 'On wishlist' : 'Save to wishlist'}</button>
                {candidate.finish === 'normal' && <button type="button" className="btn" onClick={() => showOnGraph(candidate.hex)}><Crosshair size={15} />Show on sphere</button>}
                {verdict?.kind === 'mix' && mix && <button type="button" className="btn" onClick={() => sendToMixer(mix.items.map((i) => ({ code: i.paint.id, parts: i.parts })))}><FlaskConical size={15} />Try the mix</button>}
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

const Swatch = ({ hex, metal, label }: { hex: string; metal?: MetalSwatch | null; label: string }) => (
  <span className="flex flex-1 flex-col justify-end p-2.5 text-xs" style={{ background: paintBackground(hex, metal), color: inkOn(metal ? (metal.stops[0] ?? hex) : hex) }}>
    <span className="font-semibold">{label}</span>
    <span className="tnum">{hex}</span>
  </span>
)
