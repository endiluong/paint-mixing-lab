import { useCallback, useEffect, useMemo, useState } from 'react'
import { PaintDialog } from '@/components/PaintDialog'
import { RestoreDialog } from '@/components/RestoreDialog'
import { Segmented } from '@/components/Segmented'
import { BuyTab } from '@/features/buy/BuyTab'
import { InventoryTab } from '@/features/inventory/InventoryTab'
import { MixerTab } from '@/features/mixer/MixerTab'
import type { MixItem } from '@/features/mixer/bench'
import { RecipesTab } from '@/features/recipes/RecipesTab'
import { useCollection } from '@/hooks/useCollection'
import { usePersisted } from '@/hooks/usePersisted'
import { backupName, MAX_BACKUP_BYTES, readBackup, writeBackup, type Backup, type UserData } from '@/lib/backup'
import { toFields } from '@/lib/collection'
import { onSaveError, snapshot, type Boot } from '@/lib/db'
import { isUsable } from '@/lib/paints'
import { saveFile } from '@/lib/saveFile'
import type { StoredPaint, UsablePaint } from '@/lib/types'

type Tab = 'mixer' | 'recipes' | 'buy' | 'inventory'

interface Notice {
  key: number
  text: string
  undo: (() => void) | null
  ms: number
}

const NOTICE_MS = 10000
/** Longer after a restore, because it replaces everything. */
const RESTORE_MS = 60000
const RESTORE_FAILED = 'The data could not be stored, so nothing was changed. The browser storage may be full.'

interface Props {
  boot: Boot
  /** Told when the app starts again after a restore. */
  startNotice: string | null
  undoRestore: (() => Promise<void>) | null
  restore: (data: UserData, shown: StoredPaint[]) => Promise<void>
}

export const App = ({ boot, startNotice, undoRestore, restore }: Props) => {
  const [tab, setTab] = useState<Tab>(startNotice ? 'inventory' : 'mixer')
  const [probe, setProbe] = useState<string | null>(null)
  const [mixItems, setMixItems] = usePersisted<MixItem[]>('pml.mix', [])
  const collection = useCollection(boot.paints)
  const { paints } = collection
  const usable = useMemo(() => paints.filter(isUsable), [paints])
  /** undefined: closed, null: adding, otherwise the id being edited. */
  const [editing, setEditing] = useState<string | null | undefined>(undefined)
  const edited = editing ? (paints.find((p) => p.id === editing) ?? null) : null
  const [notice, setNotice] = useState<Notice | null>(() => {
    if (!startNotice) return null
    const undo = undoRestore ? () => void undoRestore().catch(() => tell(RESTORE_FAILED)) : null
    return { key: 0, text: startNotice, undo, ms: undo ? RESTORE_MS : NOTICE_MS }
  })
  const [found, setFound] = useState<{ backup: Backup; now: UserData } | null>(null)
  const tell = useCallback((text: string, undo: (() => void) | null = null) => setNotice({ key: Date.now(), text, undo, ms: NOTICE_MS }), [])

  useEffect(() => onSaveError((text) => tell(text)), [tell])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), notice.ms)
    return () => clearTimeout(timer)
  }, [notice])

  const sendToMixer = useCallback(
    (items: MixItem[]) => {
      setMixItems(items.slice(0, 4))
      setProbe(null)
      setTab('mixer')
    },
    [setMixItems],
  )
  const showOnGraph = useCallback((hex: string) => {
    setProbe(hex)
    setTab('mixer')
  }, [])
  const remove = (ids: string[]): void => {
    const gone = collection.remove(ids)
    if (gone.length > 0) tell(gone.length === 1 ? `${gone[0].name} removed from your paints.` : `${gone.length} paints removed.`, () => collection.restore(gone))
  }
  const backUp = async (): Promise<void> => {
    try {
      const now = new Date()
      saveFile(backupName(now), 'application/json', writeBackup(await snapshot(collection.records), now))
      tell('Backup file made.')
    } catch {
      tell('Your data could not be read. Reload the page and try again.')
    }
  }
  const openBackup = async (file: File): Promise<void> => {
    if (file.size > MAX_BACKUP_BYTES) return tell('This file is too large to be a backup.')
    try {
      const read = readBackup(await file.text())
      if ('error' in read) return tell(read.error)
      setFound({ backup: read.backup, now: await snapshot(collection.records) })
    } catch {
      tell('This file could not be read.')
    }
  }
  const own = (p: UsablePaint): void => {
    collection.add(toFields(p), { id: p.id, hex: p.hex, from: p.hexSource, brand: p.brand, code: p.code, name: p.name })
    tell(`${p.name} added to your paints.`)
  }

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-2.5">
        <h1 className="text-base font-semibold">Paint Mixing Lab</h1>
        <Segmented
          label="Section"
          value={tab}
          onChange={setTab}
          options={[{ value: 'mixer', label: 'Mixer' }, { value: 'recipes', label: 'Recipes' }, { value: 'buy', label: 'Buy check' }, { value: 'inventory', label: 'Inventory' }]}
        />
      </header>
      {!boot.kept && <p role="alert" className="border-b border-line bg-raised px-4 py-2 text-sm">This browser blocks storage, so changes are lost when you close the page. Leave private browsing to keep them.</p>}
      <main className="min-h-0 flex-1">
        {tab === 'mixer' && <MixerTab paints={usable} collection={paints} mixItems={mixItems} setMixItems={setMixItems} probe={probe} create={() => setEditing(null)} edit={setEditing} remove={(id) => remove([id])} own={own} />}
        {tab === 'recipes' && <RecipesTab paints={paints} usable={usable} sendToMixer={sendToMixer} />}
        {tab === 'buy' && <BuyTab paints={paints} sendToMixer={sendToMixer} showOnGraph={showOnGraph} />}
        {tab === 'inventory' && (
          <InventoryTab paints={paints} missing={collection.missing.length} change={collection.patch} reset={collection.reset} create={() => setEditing(null)} edit={setEditing} remove={remove} backUp={() => void backUp()} openBackup={(file) => void openBackup(file)} restoreBuiltIn={() => { collection.restore(collection.missing.map((p) => ({ ...p, addedAt: new Date().toISOString() }))); tell(`${collection.missing.length} built-in paints are back.`) }} />
        )}
      </main>

      {(editing === null || edited) && (
        <PaintDialog
          key={editing ?? 'new'}
          paint={edited}
          paints={paints}
          close={() => setEditing(undefined)}
          remove={() => {
            setEditing(undefined)
            if (edited) remove([edited.id])
          }}
          save={(fields, source) => {
            if (edited) collection.edit(edited.id, fields, edited.hex)
            else collection.add(fields, source)
            tell(edited ? `${fields.name.trim()} saved.` : `${fields.name.trim()} added to your paints.`)
            setEditing(undefined)
          }}
        />
      )}
      {found && (
        <RestoreDialog
          backup={found.backup}
          now={found.now}
          close={() => setFound(null)}
          confirm={() => {
            setFound(null)
            restore({ paints: found.backup.paints, state: found.backup.state }, collection.records).catch(() => tell(RESTORE_FAILED))
          }}
        />
      )}
      <div role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
        {notice && (
          <div key={notice.key} className="pointer-events-auto flex items-center gap-3 rounded-lg border border-line bg-raised px-4 py-2.5 shadow-xl">
            <span>{notice.text}</span>
            {notice.undo && <button type="button" className="btn py-1" onClick={() => { notice.undo?.(); setNotice(null) }}>Undo</button>}
          </div>
        )}
      </div>
    </div>
  )
}
