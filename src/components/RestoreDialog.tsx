import { useEffect, useId, useRef } from 'react'
import { countData, type Backup, type UserData } from '@/lib/backup'

interface Props {
  backup: Backup
  now: UserData
  confirm: () => void
  close: () => void
}

/** Shows what is here and what is in the file before anything is replaced. */
export const RestoreDialog = ({ backup, now, confirm, close }: Props) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
  }, [])
  const mine = countData(now)
  const made = backup.madeAt ? new Date(backup.madeAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}t`}
      onClose={close}
      onPointerDown={(e) => e.target === dialog.current && dialog.current.close()}
      className="m-auto w-[min(440px,calc(100vw-24px))] rounded-xl border border-line bg-panel p-0 text-text backdrop:bg-black/70"
    >
      <div className="grid gap-4 p-5">
        <h2 id={`${id}t`} className="text-lg font-semibold">Replace your data with this backup?</h2>
        {made && <p className="text-sm text-dim">Backup from {made}</p>}
        <table className="w-full text-sm">
          <thead className="text-dim">
            <tr>
              <td />
              <th scope="col" className="py-1 text-right font-medium">In this browser</th>
              <th scope="col" className="py-1 text-right font-medium">In the backup</th>
            </tr>
          </thead>
          <tbody>
            {countData(backup).map((row, i) => (
              <tr key={row.label} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-normal">{row.label}</th>
                <td className="text-right tnum">{mine[i].count}</td>
                <td className="text-right font-semibold tnum">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {backup.skipped > 0 && <p role="alert" className="rounded-md border border-line bg-raised px-3 py-2 text-sm">{backup.skipped === 1 ? '1 entry' : `${backup.skipped} entries`} in the file cannot be read and will be left out.</p>}
        <p className="text-sm text-dim">Everything in this browser is replaced, including your mix, layers and settings. You can undo it right after.</p>
        <div className="flex gap-2">
          <button type="button" className="btn-main" onClick={confirm}>Replace my data</button>
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>Cancel</button>
        </div>
      </div>
    </dialog>
  )
}
