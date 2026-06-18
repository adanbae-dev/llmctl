// KPI card. Extracted verbatim from UsageDashboard (Phase 1,
// behavior-preserving). Phase 2 may migrate consumers to <Stat>.
export function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent ?? 'text-neutral-100'}`}>{value}</div>
    </div>
  )
}
