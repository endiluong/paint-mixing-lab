import { useCallback, useEffect, useState } from 'react'
import { App } from './App'
import type { UserData } from './lib/backup'
import { onReplaced, replaceAll, snapshot, type Boot } from './lib/db'
import type { StoredPaint } from './lib/types'

interface Run {
  key: number
  boot: Boot
  notice: string | null
  /** What was there before a restore. */
  before: UserData | null
}

/** After a restore the whole app starts again from the new data, so no screen keeps showing or saving the old. */
export const Root = ({ boot }: { boot: Boot }) => {
  const [run, setRun] = useState<Run>({ key: 0, boot, notice: null, before: null })
  const start = useCallback((next: Boot, notice: string, before: UserData | null) => setRun((prev) => ({ key: prev.key + 1, boot: next, notice, before })), [])
  useEffect(() => onReplaced((next) => start(next, 'Your data was replaced in another tab.', null)), [start])

  const restore = async (data: UserData, shown: StoredPaint[]): Promise<void> => {
    const before = await snapshot(shown)
    start(await replaceAll(data), 'Backup restored.', before)
  }
  const { before } = run
  const undo = before ? async () => start(await replaceAll(before), 'Your data is back as it was.', null) : null
  return <App key={run.key} boot={run.boot} startNotice={run.notice} undoRestore={undo} restore={restore} />
}
