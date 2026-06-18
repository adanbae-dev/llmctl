// Horizontal bar list with hover tooltip. Extracted verbatim from
// UsageDashboard (Phase 1, behavior-preserving).
export function BarList({
  title,
  total,
  items,
  color = 'bg-sky-500',
  fmtValue,
}: {
  title: string
  total?: number
  items: { label: string; value: number; title?: string }[]
  color?: string
  fmtValue?: (n: number) => string
}) {
  if (items.length === 0) return null
  const max = items[0]?.value || 1
  const f = fmtValue ?? ((n: number) => n.toLocaleString())
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-neutral-400">
        {title}
        {total != null && <span className="text-neutral-600"> · {total.toLocaleString()}</span>}
      </h3>
      <div className="space-y-1.5">
        {items.map((t, i) => (
          <div key={`${t.title ?? t.label}-${i}`} className="group relative flex items-center gap-2 text-xs">
            <span className="w-40 shrink-0 truncate font-mono text-neutral-300">{t.label}</span>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
              <div className={`h-full rounded ${color}`} style={{ width: `${Math.max((t.value / max) * 100, 2)}%` }} />
            </div>
            <span className="w-20 shrink-0 text-right tabular-nums text-neutral-400">{f(t.value)}</span>
            <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden max-w-[90vw] whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-[11px] text-neutral-200 shadow-lg group-hover:block">
              {t.title ?? t.label} · {f(t.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
