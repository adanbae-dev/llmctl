import type { ReactNode } from 'react'

type Tone = 'default' | 'cost' | 'output' | 'cache' | 'brand' | 'danger'

const TONE: Record<Tone, string> = {
  default: 'text-fg-strong',
  cost: 'text-data-cost',
  output: 'text-data-output',
  cache: 'text-data-cache',
  brand: 'text-brand',
  danger: 'text-danger',
}

/** Product KPI stat (token-based). The Phase 2 successor to <Card>:
 *  supports an inline hint (e.g. <InfoDot/>) and a hero size for the
 *  single emphasized overview metric. */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  size = 'md',
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
  size?: 'md' | 'lg'
}) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-1 text-2xs text-fg-subtle">
        {label}
        {hint}
      </div>
      <div className={`mt-1 font-medium tabular-nums ${size === 'lg' ? 'text-hero' : 'text-xl'} ${TONE[tone]}`}>
        {value}
      </div>
    </div>
  )
}
