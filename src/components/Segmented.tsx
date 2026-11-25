interface Props<T extends string> {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
}

export const Segmented = <T extends string>({ label, value, onChange, options }: Props<T>) => (
  <div role="group" aria-label={label} className="inline-flex rounded-md border border-line bg-desk p-0.5">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        aria-pressed={o.value === value}
        onClick={() => onChange(o.value)}
        className={`rounded px-3 py-1 text-sm ${o.value === value ? 'bg-text font-semibold text-[#111]' : 'text-dim hover:text-text'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
)
