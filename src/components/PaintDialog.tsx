import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Trash2, X } from 'lucide-react'
import { loadCatalog, searchCatalog, type CatalogPaint } from '@/lib/catalog'
import { COLOR_GROUPS, findTwin, isNormalType, PAINT_TYPES, problemWith, toFields, type Source } from '@/lib/collection'
import { isHex } from '@/lib/color'
import { guessGroup } from '@/lib/group'
import type { Paint, PaintFields } from '@/lib/types'
import { PaintPill } from './PaintPill'

interface Props {
  /** The paint to edit, or null to add one. */
  paint: Paint | null
  paints: Paint[]
  save: (fields: PaintFields, source: Source | null) => void
  remove: () => void
  close: () => void
}

const BLANK: PaintFields = { name: '', code: '', brand: '', line: '', type: 'Acrylic', group: '', hex: null, inMixer: true }

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))].sort()

export const PaintDialog = ({ paint, paints, save, remove, close }: Props) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const first = useRef<HTMLInputElement>(null)
  const id = useId()
  const [fields, setFields] = useState<PaintFields>(() => (paint ? toFields(paint) : BLANK))
  const [hexText, setHexText] = useState(paint?.hex ?? '')
  const [source, setSource] = useState<Source | null>(null)
  const [groupPicked, setGroupPicked] = useState(paint !== null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState<CatalogPaint[] | null>(null)
  const [failed, setFailed] = useState(false)
  const slow = useDeferredValue(query)

  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
    first.current?.focus()
  }, [])
  useEffect(() => {
    if (paint) return
    let live = true
    loadCatalog().then((rows) => live && setCatalog(rows), () => live && setFailed(true))
    return () => {
      live = false
    }
  }, [paint])

  const hits = useMemo(() => (catalog ? searchCatalog(slow, catalog) : []), [slow, catalog])
  const brands = useMemo(() => unique([...paints.map((p) => p.brand), 'Army Painter', 'Citadel', 'Vallejo', 'Scale75', 'AK Interactive']), [paints])
  const lines = useMemo(() => unique(paints.filter((p) => !fields.brand || p.brand === fields.brand).map((p) => p.line)), [paints, fields.brand])
  const types = useMemo(() => [...new Set([...PAINT_TYPES, fields.type])], [fields.type])
  const groups = useMemo(() => [...new Set([...COLOR_GROUPS, fields.group])].filter(Boolean), [fields.group])

  const set = (patch: Partial<PaintFields>): void => {
    setError(null)
    setFields((prev) => {
      const next = { ...prev, ...patch }
      if (patch.type) next.inMixer = isNormalType(patch.type)
      if (!groupPicked && !patch.group) next.group = guessGroup(next.name, next.hex && isHex(next.hex) ? next.hex : null) ?? prev.group
      return next
    })
  }
  const setHex = (raw: string): void => {
    const v = raw.trim() && !raw.trim().startsWith('#') ? `#${raw.trim()}` : raw.trim()
    setHexText(v)
    set({ hex: v ? v.toUpperCase() : null })
  }
  const take = (p: CatalogPaint): void => {
    setFields(p.fields)
    setHexText(p.fields.hex ?? '')
    setGroupPicked(true)
    setSource(p.source)
    setQuery('')
    setError(null)
  }
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const why = problemWith(fields, paints, paint?.id ?? null)
    if (why) return setError(why)
    // A changed identity is a different paint, so it must not keep the id of the one picked from the data
    const kept = source && source.brand === fields.brand.trim() && source.code === fields.code.trim() && (source.code !== '' || source.name === fields.name.trim())
    save(fields, kept ? source : null)
  }

  const label = 'mb-1 block text-sm text-dim'
  const shownHex = isHex(hexText) ? hexText : null
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}t`}
      onClose={close}
      onPointerDown={(e) => e.target === dialog.current && dialog.current.close()}
      className="scroll m-auto max-h-[92dvh] w-[min(560px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-line bg-panel p-0 text-text backdrop:bg-black/70"
    >
      <form onSubmit={submit} noValidate className="grid gap-4 p-5">
        <div className="flex items-center gap-3">
          <h2 id={`${id}t`} className="flex-1 text-lg font-semibold">{paint ? 'Edit paint' : 'Add a paint'}</h2>
          <button type="button" className="p-1.5 text-dim hover:text-text" aria-label="Close" onClick={() => dialog.current?.close()}><X size={18} /></button>
        </div>

        {!paint && (
          <div>
            <label className={label} htmlFor={`${id}q`}>Find it by code, name or brand</label>
            <input id={`${id}q`} ref={first} className="field w-full" autoComplete="off" placeholder={catalog ? `Search ${catalog.length.toLocaleString('en')} paints` : 'Loading paint data'} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }} />
            {failed && <p role="alert" className="mt-2 text-sm">The paint data did not load. You can still fill in the form.</p>}
            {query.trim() !== '' && catalog && (
              <ul className="scroll mt-2 flex max-h-52 flex-wrap content-start gap-1.5 overflow-y-auto rounded-md bg-desk p-2.5">
                {hits.map((h) => {
                  const twin = findTwin(h.fields, paints, null)
                  return (
                    <li key={h.source.id + h.fields.line + h.fields.name} className="max-w-full">
                      <PaintPill hex={h.fields.hex} name={h.fields.name} code={h.fields.code} owned={twin !== null} title={`${h.fields.brand}, ${h.fields.line}`} onClick={() => (twin ? setError(`You already have ${[twin.brand, twin.name, twin.code].filter(Boolean).join(' ')}.`) : take(h))} />
                      <span className="ml-1.5 text-xs text-dim">{h.fields.brand}, {h.fields.line}</span>
                    </li>
                  )
                })}
                {hits.length === 0 && <li className="text-sm text-dim">Not in the data. Fill in the form below.</li>}
              </ul>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className={label}>Name</span><input ref={paint ? first : undefined} className="field w-full" value={fields.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <label><span className={label}>Brand</span><input className="field w-full" list={`${id}b`} value={fields.brand} onChange={(e) => set({ brand: e.target.value })} /></label>
          <label><span className={label}>Code, if it has one</span><input className="field w-full" value={fields.code} onChange={(e) => set({ code: e.target.value })} /></label>
          <label><span className={label}>Line</span><input className="field w-full" list={`${id}l`} value={fields.line} onChange={(e) => set({ line: e.target.value })} /></label>
          <label><span className={label}>Type</span><select className="field w-full" value={fields.type} onChange={(e) => set({ type: e.target.value })}>{types.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>
            <span className={label}>Color group</span>
            <select className="field w-full" value={fields.group} onChange={(e) => { setGroupPicked(true); set({ group: e.target.value }) }}>
              <option value="" disabled>Choose</option>
              {groups.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <div>
            <label className={label} htmlFor={`${id}h`}>Hex</label>
            <div className="flex gap-2">
              <input type="color" aria-label="Pick the color" className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-line bg-desk p-0.5" value={(shownHex ?? '#808080').toLowerCase()} onChange={(e) => setHex(e.target.value.toUpperCase())} />
              <input id={`${id}h`} className="field min-w-0 flex-1 tnum" placeholder="#8A2B2B" value={hexText} onChange={(e) => setHex(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2.5 sm:col-span-2"><input type="checkbox" checked={fields.inMixer && fields.hex !== null} disabled={!fields.hex} onChange={(e) => set({ inMixer: e.target.checked })} />Use in the mixer</label>
        </div>
        <datalist id={`${id}b`}>{brands.map((b) => <option key={b} value={b} />)}</datalist>
        <datalist id={`${id}l`}>{lines.map((l) => <option key={l} value={l} />)}</datalist>

        {(fields.name || shownHex) && <div><PaintPill hex={shownHex} name={fields.name || 'No name yet'} code={fields.code} owned /></div>}
        {error && <p role="alert" className="rounded-md border border-line bg-raised px-3 py-2 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-main">{paint ? 'Save changes' : 'Add to my paints'}</button>
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>Cancel</button>
          {paint && <button type="button" className="btn ml-auto" onClick={remove}><Trash2 size={15} />Remove</button>}
        </div>
      </form>
    </dialog>
  )
}
