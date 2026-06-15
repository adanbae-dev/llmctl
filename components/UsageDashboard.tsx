'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { DateRangePicker } from './DateRangePicker'
import { estimateCostUSD, isApprox } from '@/lib/pricing'

interface UsageRow {
  date: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
  messages: number
}

interface ToolRow {
  date: string
  tool: string
  count: number
}

type Provider = 'claude' | 'cursor' | 'codex'
const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'codex', label: 'Codex / GPT' },
]

const fmt = (n: number) => n.toLocaleString()

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent ?? 'text-neutral-100'}`}>{value}</div>
    </div>
  )
}

export function UsageDashboard() {
  const [provider, setProvider] = useState<Provider>('claude')
  const [rows, setRows] = useState<UsageRow[]>([])
  const [tools, setTools] = useState<ToolRow[]>([])
  const [models, setModels] = useState<string[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/usage?provider=${provider}`)
      .then((r) => r.json())
      .then((d) => {
        const rs: UsageRow[] = d.rows ?? []
        const ms: string[] = d.models ?? []
        setRows(rs)
        setTools(d.tools ?? [])
        setModels(ms)
        setSel(new Set(ms))
        const dates = rs.map((r) => r.date).sort()
        setFrom(dates[0] ?? '')
        setTo(dates[dates.length - 1] ?? '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [provider])

  const filtered = useMemo(
    () => rows.filter((r) => sel.has(r.model) && (!from || r.date >= from) && (!to || r.date <= to)),
    [rows, sel, from, to],
  )

  const bounds = useMemo(() => {
    const dates = rows.map((r) => r.date).sort()
    return { min: dates[0] ?? '', max: dates[dates.length - 1] ?? '' }
  }, [rows])

  const totals = useMemo(
    () =>
      filtered.reduce(
        (a, r) => ({
          input: a.input + r.input,
          output: a.output + r.output,
          cacheRead: a.cacheRead + r.cacheRead,
          cacheCreate: a.cacheCreate + r.cacheCreate,
          messages: a.messages + r.messages,
        }),
        { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, messages: 0 },
      ),
    [filtered],
  )

  const totalCost = useMemo(
    () => filtered.reduce((sum, r) => sum + estimateCostUSD(r.model, r), 0),
    [filtered],
  )
  const hasApprox = useMemo(() => filtered.some((r) => isApprox(r.model)), [filtered])

  const perDay = useMemo(() => {
    const m = new Map<string, { date: string; output: number; input: number; cacheRead: number }>()
    for (const r of filtered) {
      const e = m.get(r.date) ?? { date: r.date, output: 0, input: 0, cacheRead: 0 }
      e.output += r.output
      e.input += r.input
      e.cacheRead += r.cacheRead
      m.set(r.date, e)
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [filtered])

  const perModel = useMemo(() => {
    const m = new Map<
      string,
      { model: string; output: number; input: number; cacheRead: number; cacheCreate: number; messages: number }
    >()
    for (const r of filtered) {
      const e = m.get(r.model) ?? { model: r.model, output: 0, input: 0, cacheRead: 0, cacheCreate: 0, messages: 0 }
      e.output += r.output
      e.input += r.input
      e.cacheRead += r.cacheRead
      e.cacheCreate += r.cacheCreate
      e.messages += r.messages
      m.set(r.model, e)
    }
    return [...m.values()]
      .map((e) => ({ ...e, cost: estimateCostUSD(e.model, e), approx: isApprox(e.model) }))
      .sort((a, b) => b.cost - a.cost)
  }, [filtered])

  const toolUsage = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tools) {
      if ((from && t.date < from) || (to && t.date > to)) continue
      m.set(t.tool, (m.get(t.tool) ?? 0) + t.count)
    }
    return [...m.entries()].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count)
  }, [tools, from, to])

  function toggle(model: string) {
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(model)) n.delete(model)
      else n.add(model)
      return n
    })
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-lg font-semibold">📊 토큰 사용량 · 비용</h1>
        <p className="mt-0.5 text-xs text-neutral-500">제공자별 전 세션 합계 · 일자/모델 필터</p>
      </div>

      {/* provider selector — always visible */}
      <div className="flex gap-1">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setProvider(p.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              provider === p.id
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-neutral-600">집계 중…</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-neutral-600">
          이 제공자는 토큰 사용량 데이터가 없습니다.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
            <div className="flex items-center gap-2">
              기간
              <DateRangePicker
                from={from}
                to={to}
                min={bounds.min}
                max={bounds.max}
                onChange={(f, t) => {
                  setFrom(f)
                  setTo(t)
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              모델:
              {models.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggle(m)}
                  className={`rounded-full border px-2 py-0.5 font-mono ${
                    sel.has(m)
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                      : 'border-neutral-700 text-neutral-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Card
              label="추정 비용 (USD)"
              value={`${hasApprox ? '≈ ' : ''}$${totalCost.toFixed(2)}`}
              accent="text-amber-300"
            />
            <Card label="출력 토큰 (생성)" value={fmt(totals.output)} accent="text-emerald-300" />
            <Card label="입력 토큰" value={fmt(totals.input)} />
            <Card label="캐시 read 토큰" value={fmt(totals.cacheRead)} />
            <Card label="메시지 수" value={fmt(totals.messages)} />
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <h2 className="mb-3 text-sm font-medium text-neutral-300">일자별 토큰</h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perDay} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
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
                  <Bar dataKey="output" name="출력" stackId="a" fill="#34d399" />
                  <Bar dataKey="input" name="입력" stackId="a" fill="#60a5fa" />
                  <Bar dataKey="cacheRead" name="캐시read" stackId="a" fill="#a78bfa" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <h2 className="mb-3 text-sm font-medium text-neutral-300">모델별</h2>
            <table className="w-full text-left text-xs">
              <thead className="text-neutral-500">
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
                  <tr key={m.model} className="border-t border-neutral-800/60">
                    <td className="py-1 font-mono text-neutral-300">{m.model}</td>
                    <td className="py-1 text-right text-emerald-300">{fmt(m.output)}</td>
                    <td className="py-1 text-right text-neutral-400">{fmt(m.input)}</td>
                    <td className="py-1 text-right text-neutral-400">{fmt(m.messages)}</td>
                    <td className="py-1 text-right text-amber-300">
                      {m.approx ? '≈ ' : ''}${m.cost.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <h2 className="mb-3 text-sm font-medium text-neutral-300">🔧 도구 사용</h2>
            {toolUsage.length === 0 ? (
              <p className="text-xs text-neutral-600">이 제공자는 도구 호출 데이터가 없습니다.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-neutral-500">
                  <tr>
                    <th className="py-1">도구</th>
                    <th className="py-1 text-right">호출 수</th>
                  </tr>
                </thead>
                <tbody>
                  {toolUsage.map((t) => (
                    <tr key={t.tool} className="border-t border-neutral-800/60">
                      <td className="py-1 font-mono text-cyan-300">{t.tool}</td>
                      <td className="py-1 text-right text-neutral-300">{fmt(t.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-neutral-600">
            ⚠️ 입력 토큰은 매 턴 컨텍스트가 재전송되어 합계가 부풀려질 수 있습니다. 실제 “생성량”은 출력 토큰을 참고하세요.
            <br />
            💲 비용은 <b>추정치</b>입니다(캐시 read 0.1× · write 1.25×, 5분 TTL 가정).{' '}
            <b>≈</b> 표시는 단가 미검증 모델(GPT/Gemini, 또는 Cursor처럼 모델 미기록 → Opus 단가 가정)이며 실제와 다를 수 있습니다 — 단가는 <code>lib/pricing.ts</code>에서 조정하세요.
          </p>
        </>
      )}
    </div>
  )
}
