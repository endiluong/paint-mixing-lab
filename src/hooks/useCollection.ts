import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPaint, editPaint, patchPaint, resetPaint, type Source } from '@/lib/collection'
import { deletePaints, onOtherTab, putPaints } from '@/lib/db'
import { buildPaint, START_WITH_INVENTORY, STARTER } from '@/lib/paints'
import type { Paint, PaintFields, PaintOverride, StoredPaint } from '@/lib/types'

export interface Collection {
  paints: Paint[]
  /** The same paints, as stored. */
  records: StoredPaint[]
  add: (fields: PaintFields, source: Source | null) => string
  edit: (id: string, fields: PaintFields, shownHex: string | null) => void
  patch: (id: string, patch: PaintOverride) => void
  reset: (id: string) => void
  /** Returns the removed records, for undo. */
  remove: (ids: string[]) => StoredPaint[]
  restore: (records: StoredPaint[]) => void
  /** Built-in paints that are not in the collection now. None on a built page. */
  missing: StoredPaint[]
}

export const useCollection = (initial: StoredPaint[]): Collection => {
  const [byId, setById] = useState(() => new Map(initial.map((p) => [p.id, p])))
  useEffect(() => onOtherTab((all) => setById(new Map(all.map((p) => [p.id, p])))), [])

  const put = useCallback((records: StoredPaint[]) => {
    setById((prev) => {
      const next = new Map(prev)
      for (const r of records) next.set(r.id, r)
      return next
    })
    putPaints(records)
  }, [])
  const change = useCallback(
    (id: string, fn: (p: StoredPaint) => StoredPaint) => {
      const p = byId.get(id)
      if (p) put([fn(p)])
    },
    [byId, put],
  )

  const records = useMemo(() => [...byId.values()], [byId])
  const paints = useMemo(() => records.map((r) => buildPaint(r)), [records])
  const missing = useMemo(() => (START_WITH_INVENTORY ? STARTER.filter((s) => !byId.has(s.id)) : []), [byId])
  return {
    paints,
    records,
    missing,
    add: (fields, source) => {
      const made = createPaint(fields, source)
      // The id can be taken by a paint whose code was edited: never overwrite it
      const record = byId.has(made.id) ? { ...made, id: `my-${crypto.randomUUID()}` } : made
      put([record])
      return record.id
    },
    edit: (id, fields, shownHex) => change(id, (p) => editPaint(p, fields, shownHex)),
    patch: (id, patch) => change(id, (p) => patchPaint(p, patch)),
    reset: (id) => change(id, resetPaint),
    remove: (ids) => {
      const gone = ids.flatMap((id) => byId.get(id) ?? [])
      setById((prev) => {
        const next = new Map(prev)
        for (const id of ids) next.delete(id)
        return next
      })
      deletePaints(ids)
      return gone
    },
    restore: put,
  }
}
