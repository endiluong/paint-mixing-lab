import { useCallback, useMemo, useState } from 'react'
import { Segmented } from '@/components/Segmented'
import { InventoryTab } from '@/features/inventory/InventoryTab'
import { MixerTab } from '@/features/mixer/MixerTab'
import type { MixItem } from '@/features/mixer/bench'
import { RecipesTab } from '@/features/recipes/RecipesTab'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { buildPaints, isUsable } from '@/lib/paints'
import type { PaintOverride } from '@/lib/types'

type Tab = 'mixer' | 'recipes' | 'inventory'

export const App = () => {
  const [tab, setTab] = useState<Tab>('mixer')
  const [overrides, setOverrides] = useLocalStorage<Record<string, PaintOverride>>('pml.overrides', {})
  const [mixItems, setMixItems] = useLocalStorage<MixItem[]>('pml.mix', [])
  const paints = useMemo(() => buildPaints(overrides), [overrides])
  const usable = useMemo(() => paints.filter(isUsable), [paints])

  const change = useCallback(
    (code: string, patch: PaintOverride) => setOverrides((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } })),
    [setOverrides],
  )
  const sendToMixer = useCallback(
    (items: MixItem[]) => {
      setMixItems(items.slice(0, 4))
      setTab('mixer')
    },
    [setMixItems],
  )

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-2.5">
        <h1 className="text-base font-semibold">Paint Mixing Lab</h1>
        <Segmented
          label="Section"
          value={tab}
          onChange={setTab}
          options={[{ value: 'mixer', label: 'Mixer' }, { value: 'recipes', label: 'Recipes' }, { value: 'inventory', label: 'Inventory' }]}
        />
      </header>
      <main className="min-h-0 flex-1">
        {tab === 'mixer' && <MixerTab paints={usable} mixItems={mixItems} setMixItems={setMixItems} />}
        {tab === 'recipes' && <RecipesTab paints={paints} usable={usable} sendToMixer={sendToMixer} />}
        {tab === 'inventory' && <InventoryTab paints={paints} change={change} reset={(code) => setOverrides((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== code)))} />}
      </main>
    </div>
  )
}
