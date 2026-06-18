'use client'

import { useEffect, useState } from 'react'
import { Section, Skeleton, InfoDot } from '@/components/ui'
import { estimateCostUSD, isApprox } from '@/lib/pricing'
import { GLOSSARY } from '@/lib/glossary'
import { fmt, usd, type UsageRow } from './shared'

const PROVIDERS = [
  { id: 'claude', label: 'Claude' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'codex', label: 'Codex / GPT' },
] as const

type Row = {
  id: string
  label: string
  cost: number
  output: number
  input: number
  messages: number
  approx: boolean
}

/** Cross-provider comparison — fetches all providers and sums whole-dataset
 *  totals side by side. Independent of the dashboard's period/model filter. */
export function CompareSection() {
  const [data, setData] = useState<Row[] | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all(
      PROVIDERS.map(async (p) => {
        try {
          const r = await fetch(`/api/usage?provider=${p.id}`)
          const d = await r.json()
          const rows: UsageRow[] = d.rows ?? []
          let cost = 0
          let output = 0
          let input = 0
          let messages = 0
          let approx = false
          for (const row of rows) {
            cost += estimateCostUSD(row.model, row)
            output += row.output
            input += row.input
            messages += row.messages
            if (isApprox(row.model)) approx = true
          }
          return { id: p.id, label: p.label, cost, output, input, messages, approx }
        } catch {
          return { id: p.id, label: p.label, cost: 0, output: 0, input: 0, messages: 0, approx: false }
        }
      }),
    ).then((res) => {
      if (alive) setData(res)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!data)
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40" />
      </div>
    )

  const maxCost = Math.max(...data.map((d) => d.cost), 0.01)

  return (
    <Section
      title="🆚 제공자 비교"
      description={`${GLOSSARY.wholeRange} · 전체 기간 합계`}
      actions={<InfoDot label={`${GLOSSARY.cost} ${GLOSSARY.costApprox}`} />}
    >
      <div className="mb-4 space-y-1.5">
        {data.map((d) => (
          <div key={d.id} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-fg-muted">{d.label}</span>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
              <div
                className="h-full rounded bg-data-cost"
                style={{ width: `${d.cost > 0 ? Math.max((d.cost / maxCost) * 100, 2) : 0}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums text-data-cost">
              {d.approx ? '≈ ' : ''}
              {usd(d.cost)}
            </span>
          </div>
        ))}
      </div>
      <table className="w-full text-left text-xs">
        <thead className="text-fg-subtle">
          <tr>
            <th className="py-1">제공자</th>
            <th className="py-1 text-right">출력</th>
            <th className="py-1 text-right">입력</th>
            <th className="py-1 text-right">메시지</th>
            <th className="py-1 text-right">추정 비용</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.id} className="border-t border-border/60">
              <td className="py-1 font-medium text-fg-muted">{d.label}</td>
              <td className="py-1 text-right tabular-nums text-data-output">{fmt(d.output)}</td>
              <td className="py-1 text-right tabular-nums text-fg-muted">{fmt(d.input)}</td>
              <td className="py-1 text-right tabular-nums text-fg-muted">{fmt(d.messages)}</td>
              <td className="py-1 text-right tabular-nums text-data-cost">
                {d.approx ? '≈ ' : ''}${d.cost.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}
