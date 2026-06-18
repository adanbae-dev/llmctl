import type { ReactNode } from 'react'

type Tone = 'neutral' | 'cost' | 'output' | 'cache' | 'mcp' | 'danger' | 'info'

const TONE: Record<Tone, string> = {
  neutral: 'bg-white/5 text-fg-muted',
  cost: 'bg-data-cost/15 text-data-cost',
  output: 'bg-data-output/15 text-data-output',
  cache: 'bg-data-cache/15 text-data-cache',
  mcp: 'bg-data-mcp/15 text-data-mcp',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-sky-500/15 text-sky-400',
}

/** Small status / provenance badge. Always carries text, never color alone. */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  )
}
