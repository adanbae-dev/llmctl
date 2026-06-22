import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { Dispatch, SetStateAction } from 'react'
import { Section, Pill, Badge, InfoDot, BarList } from '@/components/ui'
import { GLOSSARY } from '@/lib/glossary'
import { fmt, usd, shortPath, MODEL_COLORS, type CostPoint, type PerModel, type GroupRow } from './shared'
import { BudgetCard } from './BudgetCard'

export function CostSection({
  costTrend,
  monthlyCost,
  models,
  modelTrend,
  sel,
  perModel,
  byBranch,
  byProject,
  cacheTtl,
  insightMetric,
  setInsightMetric,
}: {
  costTrend: CostPoint[]
  monthlyCost: { month: string; cost: number }[]
  models: string[]
  modelTrend: Record<string, number | string>[]
  sel: Set<string>
  perModel: PerModel[]
  byBranch: GroupRow[]
  byProject: GroupRow[]
  cacheTtl: { ttl5m: number; ttl1h: number }
  insightMetric: 'tokens' | 'cost'
  setInsightMetric: Dispatch<SetStateAction<'tokens' | 'cost'>>
}) {
  const groupItems = (gs: GroupRow[], label: (g: GroupRow) => { label: string; title?: string }) =>
    gs
      .map((g) => ({
        ...label(g),
        value: insightMetric === 'cost' ? g.cost ?? 0 : g.input + g.output + g.cacheRead + g.cacheCreate,
      }))
      .sort((a, b) => b.value - a.value)
  const hasCostGroups = byBranch.length > 0 || byProject.length > 0
  const ttlTotal = cacheTtl.ttl5m + cacheTtl.ttl1h
  const ttlMax = Math.max(cacheTtl.ttl5m, cacheTtl.ttl1h, 1)
  return (
    <div className="space-y-6">
      <BudgetCard monthlyCost={monthlyCost} />
      {costTrend.length > 1 && (
        <Section
          title={
            <span className="inline-flex items-center gap-1">
              💲 비용 추이 <Badge tone="cost">추정</Badge>
            </span>
          }
          description="일일 비용 · 7일 이동평균(좌축) · 누적(우축) — 위 기간·모델 필터 반영"
          actions={<InfoDot label={GLOSSARY.estimateMethod} />}
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={costTrend} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: '#888' }}
                  tickFormatter={(v: number) => `$${v < 10 ? v.toFixed(1) : Math.round(v)}`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#888' }}
                  tickFormatter={(v: number) => `$${Math.round(v)}`}
                />
                <Tooltip
                  contentStyle={{ background: '#171717', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => usd(Number(v) || 0)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="cost" name="일일 비용" fill="#fbbf24" />
                <Line yAxisId="left" dataKey="avg7" name="7일 평균" stroke="#34d399" strokeWidth={2} dot={false} />
                <Line yAxisId="right" dataKey="cumulative" name="누적" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {models.length > 1 && modelTrend.length > 0 && (
        <Section title="📈 모델 점유율 추이" description="일자별 출력(생성) 토큰을 모델별로 누적 · 기간·모델 필터 반영">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelTrend} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#888' }}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  contentStyle={{ background: '#171717', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => fmt(Number(v) || 0)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {models
                  .filter((mm) => sel.has(mm))
                  .map((mm) => (
                    <Bar
                      key={mm}
                      dataKey={(row) => Number(row[mm]) || 0}
                      name={mm}
                      stackId="m"
                      fill={MODEL_COLORS[models.indexOf(mm) % MODEL_COLORS.length]}
                    />
                  ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      <Section title="모델별">
        <table className="w-full text-left text-xs">
          <thead className="text-fg-subtle">
            <tr>
              <th className="py-1">모델</th>
              <th className="py-1 text-right">출력</th>
              <th className="py-1 text-right">입력</th>
              <th className="py-1 text-right">메시지</th>
              <th className="py-1 text-right">추정 비용</th>
            </tr>
          </thead>
          <tbody>
            {perModel.map((m) => (
              <tr key={m.model} className="border-t border-border/60">
                <td className="py-1 font-mono text-fg-muted">{m.model}</td>
                <td className="py-1 text-right text-data-output">{fmt(m.output)}</td>
                <td className="py-1 text-right text-fg-muted">{fmt(m.input)}</td>
                <td className="py-1 text-right text-fg-muted">{fmt(m.messages)}</td>
                <td className="py-1 text-right text-data-cost">
                  {m.approx ? '≈ ' : ''}${m.cost.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {ttlTotal > 0 && (
        <Section
          title="🧊 캐시 생성 TTL"
          description={`${GLOSSARY.wholeRange} · 1시간 캐시는 write 단가가 높지만 더 오래 유지됩니다`}
        >
          <div className="space-y-1.5">
            {[
              { label: '5분 TTL', value: cacheTtl.ttl5m },
              { label: '1시간 TTL', value: cacheTtl.ttl1h },
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 text-fg-muted">{r.label}</span>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
                  <div
                    className="h-full rounded bg-data-cache"
                    style={{ width: `${Math.max((r.value / ttlMax) * 100, 2)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right tabular-nums text-fg-muted">
                  {fmt(r.value)} ({ttlTotal ? ((r.value / ttlTotal) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {hasCostGroups && (
        <Section
          title="🧭 프로젝트 · 브랜치"
          description={GLOSSARY.wholeRange}
          actions={
            <div className="flex items-center gap-1">
              {(['tokens', 'cost'] as const).map((mt) => (
                <Pill key={mt} active={insightMetric === mt} onClick={() => setInsightMetric(mt)}>
                  {mt === 'tokens' ? '토큰' : '비용'}
                </Pill>
              ))}
            </div>
          }
        >
          <div className="grid gap-6 md:grid-cols-2">
            <BarList
              title={insightMetric === 'cost' ? '브랜치별 비용 (추정 USD)' : '브랜치별 토큰'}
              items={groupItems(byBranch, (g) => ({ label: g.key }))}
              color="bg-emerald-500"
              fmtValue={insightMetric === 'cost' ? usd : undefined}
            />
            <BarList
              title={insightMetric === 'cost' ? '프로젝트별 비용 (추정 USD)' : '프로젝트별 토큰'}
              items={groupItems(byProject, (g) => ({ label: shortPath(g.key), title: g.key }))}
              color="bg-sky-500"
              fmtValue={insightMetric === 'cost' ? usd : undefined}
            />
          </div>
        </Section>
      )}
    </div>
  )
}
