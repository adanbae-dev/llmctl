'use client'

import { useEffect, useMemo, useState } from 'react'
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

interface GroupRow {
  key: string
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
  messages: number
  cost: number
}

interface CountRow {
  key: string
  count: number
}

interface ToolErrorRow {
  tool: string
  total: number
  errors: number
}

type Provider = 'claude' | 'cursor' | 'codex'
const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'codex', label: 'Codex / GPT' },
]

const fmt = (n: number) => n.toLocaleString()
const usd = (n: number) => `$${n.toFixed(2)}`
const DOW = ['일', '월', '화', '수', '목', '금', '토']

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

// Category color for a tool name (built-in heuristics + MCP).
function toolColor(tool: string): string {
  const t = tool.toLowerCase()
  if (t.startsWith('mcp__')) return 'bg-fuchsia-500'
  if (/(^|[_-])(bash|shell|exec|terminal)/.test(t)) return 'bg-red-500'
  if (/(write|edit|apply_patch|create|notebookedit|multiedit)/.test(t)) return 'bg-amber-500'
  if (/(read|grep|glob|search|webfetch|websearch|fetch|ls)/.test(t)) return 'bg-blue-500'
  if (/(task|agent|worktree)/.test(t)) return 'bg-emerald-500'
  return 'bg-neutral-500'
}

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent ?? 'text-neutral-100'}`}>{value}</div>
    </div>
  )
}

function shortPath(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts.length <= 2 ? p : '…/' + parts.slice(-2).join('/')
}

function BarList({
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
          <div key={`${t.title ?? t.label}-${i}`} className="flex items-center gap-2 text-xs">
            <span className="w-40 shrink-0 truncate font-mono text-neutral-300" title={t.title ?? t.label}>
              {t.label}
            </span>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
              <div className={`h-full rounded ${color}`} style={{ width: `${Math.max((t.value / max) * 100, 2)}%` }} />
            </div>
            <span className="w-20 shrink-0 text-right tabular-nums text-neutral-400">{f(t.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Activity heatmap: 7 weekdays × 24 hours, intensity scaled to the busiest cell. */
function ActivityHeatmap({ data }: { data: number[][] }) {
  if (!data || data.length === 0) return null
  const max = Math.max(1, ...data.flat())
  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex">
          <div className="w-7 shrink-0" />
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="w-[14px] shrink-0 text-center text-[8px] text-neutral-600">
              {h % 6 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {data.map((row, dow) => (
          <div key={dow} className="flex items-center">
            <div className="w-7 shrink-0 text-[10px] text-neutral-500">{DOW[dow]}</div>
            {row.map((c, h) => (
              <div
                key={h}
                className="m-[1px] h-[12px] w-[12px] shrink-0 rounded-sm"
                title={`${DOW[dow]}요일 ${h}시 · ${c.toLocaleString()}`}
                style={{
                  backgroundColor:
                    c === 0 ? 'rgba(255,255,255,0.04)' : `rgba(52,211,153,${0.15 + 0.85 * (c / max)})`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function UsageDashboard() {
  const [provider, setProvider] = useState<Provider>('claude')
  const [rows, setRows] = useState<UsageRow[]>([])
  const [tools, setTools] = useState<ToolRow[]>([])
  const [insights, setInsights] = useState<{
    byProject: GroupRow[]
    byBranch: GroupRow[]
    stopReasons: CountRow[]
    skills: CountRow[]
    subagents: CountRow[]
    hotFiles: CountRow[]
    toolErrors: ToolErrorRow[]
    activity: number[][]
  }>({
    byProject: [],
    byBranch: [],
    stopReasons: [],
    skills: [],
    subagents: [],
    hotFiles: [],
    toolErrors: [],
    activity: [],
  })
  const [insightMetric, setInsightMetric] = useState<'tokens' | 'cost'>('tokens')
  const [showAllTools, setShowAllTools] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [series, setSeries] = useState({ output: true, input: true, cacheRead: false })
  const [loading, setLoading] = useState(true)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [backupErr, setBackupErr] = useState(false)

  async function doBackup() {
    setBackupBusy(true)
    setBackupMsg(null)
    setBackupErr(false)
    try {
      const r = await fetch('/api/backup', { method: 'POST' })
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`)
      setBackupMsg(`백업 완료 · 새로 복사 ${fmt(d.filesCopied)}개 · 보관함 ${fmtBytes(d.archiveBytes)}`)
    } catch (e) {
      setBackupErr(true)
      setBackupMsg(`백업 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBackupBusy(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setShowAllTools(false)
    fetch(`/api/usage?provider=${provider}`)
      .then((r) => r.json())
      .then((d) => {
        const rs: UsageRow[] = d.rows ?? []
        const ms: string[] = d.models ?? []
        setRows(rs)
        setTools(d.tools ?? [])
        setInsights({
          byProject: d.byProject ?? [],
          byBranch: d.byBranch ?? [],
          stopReasons: d.stopReasons ?? [],
          skills: d.skills ?? [],
          subagents: d.subagents ?? [],
          hotFiles: d.hotFiles ?? [],
          toolErrors: d.toolErrors ?? [],
          activity: d.activity ?? [],
        })
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

  // Daily estimated cost + running total + 7-day moving average (respects filters).
  const costTrend = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of filtered) m.set(r.date, (m.get(r.date) ?? 0) + estimateCostUSD(r.model, r))
    const days = [...m.entries()]
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date))
    let cum = 0
    return days.map((d, i) => {
      cum += d.cost
      const win = days.slice(Math.max(0, i - 6), i + 1)
      const avg7 = win.reduce((s, x) => s + x.cost, 0) / win.length
      return { date: d.date, cost: d.cost, cumulative: cum, avg7 }
    })
  }, [filtered])

  const hasActivity = useMemo(
    () => insights.activity.some((row) => row.some((c) => c > 0)),
    [insights.activity],
  )

  // byProject / byBranch bars, switched between token total and estimated $.
  const groupItems = (gs: GroupRow[], label: (g: GroupRow) => { label: string; title?: string }) =>
    gs
      .map((g) => ({
        ...label(g),
        value: insightMetric === 'cost' ? g.cost ?? 0 : g.input + g.output + g.cacheRead + g.cacheCreate,
      }))
      .sort((a, b) => b.value - a.value)

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

  // split tools into built-in vs MCP (mcp__<server>__<tool>), MCP grouped by server
  const toolGroups = useMemo(() => {
    const builtin = toolUsage.filter((t) => !t.tool.startsWith('mcp__'))
    const mcp = toolUsage.filter((t) => t.tool.startsWith('mcp__'))
    const servers = new Map<string, { name: string; count: number }[]>()
    for (const t of mcp) {
      const parts = t.tool.split('__')
      const server = parts[1] || 'mcp'
      const name = parts.slice(2).join('__') || t.tool
      const arr = servers.get(server) ?? []
      arr.push({ name, count: t.count })
      servers.set(server, arr)
    }
    return {
      builtin,
      builtinTotal: builtin.reduce((s, t) => s + t.count, 0),
      builtinMax: builtin[0]?.count || 1,
      mcpTotal: mcp.reduce((s, t) => s + t.count, 0),
      mcpMax: mcp[0]?.count || 1,
      servers: [...servers.entries()]
        .map(([server, tools]) => ({
          server,
          tools: tools.sort((a, b) => b.count - a.count),
          total: tools.reduce((s, x) => s + x.count, 0),
        }))
        .sort((a, b) => b.total - a.total),
    }
  }, [toolUsage])

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">📊 토큰 사용량 · 비용</h1>
          <p className="mt-0.5 text-xs text-neutral-500">제공자별 전 세션 합계 · 일자/모델 필터</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={doBackup}
            disabled={backupBusy}
            title="Claude·Codex·Gemini 세션을 ~/.llmctl/archive 로 증분 백업 (원본은 읽기 전용)"
            className="shrink-0 rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            {backupBusy ? '백업 중…' : '💾 백업'}
          </button>
          {backupMsg && (
            <span className={`text-[11px] ${backupErr ? 'text-red-400' : 'text-neutral-500'}`}>
              {backupMsg}
            </span>
          )}
        </div>
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

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card
              label="추정 비용 (USD)"
              value={`${hasApprox ? '≈ ' : ''}$${totalCost.toFixed(2)}`}
              accent="text-amber-300"
            />
            <Card label="출력 토큰 (생성)" value={fmt(totals.output)} accent="text-emerald-300" />
            <Card label="입력 토큰" value={fmt(totals.input)} />
            <Card label="캐시 read 토큰" value={fmt(totals.cacheRead)} />
            <Card
              label="캐시 적중률"
              value={`${((totals.cacheRead / Math.max(totals.input + totals.cacheRead + totals.cacheCreate, 1)) * 100).toFixed(0)}%`}
              accent="text-violet-300"
            />
            <Card label="메시지 수" value={fmt(totals.messages)} />
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <h2 className="mb-3 text-sm font-medium text-neutral-300">일자별 토큰</h2>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              {(
                [
                  { key: 'output', label: '출력', on: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' },
                  { key: 'input', label: '입력', on: 'border-blue-500/50 bg-blue-500/10 text-blue-300' },
                  { key: 'cacheRead', label: '캐시read', on: 'border-violet-500/50 bg-violet-500/10 text-violet-300' },
                ] as const
              ).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSeries((p) => ({ ...p, [s.key]: !p[s.key] }))}
                  className={`rounded-full border px-2 py-0.5 ${
                    series[s.key] ? s.on : 'border-neutral-700 text-neutral-500'
                  }`}
                >
                  {s.label}
                </button>
              ))}
              <span className="text-[11px] text-neutral-600">
                캐시 read는 출력·입력보다 보통 10~100배 커서 기본 비표시
              </span>
            </div>
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
                  {series.output && <Bar dataKey="output" name="출력" stackId="a" fill="#34d399" />}
                  {series.input && <Bar dataKey="input" name="입력" stackId="a" fill="#60a5fa" />}
                  {series.cacheRead && <Bar dataKey="cacheRead" name="캐시read" stackId="a" fill="#a78bfa" />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {costTrend.length > 1 && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
              <h2 className="mb-1 text-sm font-medium text-neutral-300">💲 비용 추이 (추정)</h2>
              <p className="mb-3 text-[11px] text-neutral-600">
                일일 비용 · 7일 이동평균(좌축) · 누적(우축) — 위 기간·모델 필터 반영
              </p>
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
            </div>
          )}

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
              <>
              <div className="grid gap-6 md:grid-cols-2">
                {/* built-in tools */}
                <div>
                  <h3 className="mb-2 text-xs font-medium text-neutral-400">
                    기본 도구 <span className="text-neutral-600">· {fmt(toolGroups.builtinTotal)}</span>
                  </h3>
                  {toolGroups.builtin.length === 0 ? (
                    <p className="text-[11px] text-neutral-600">없음</p>
                  ) : (
                    <div className="space-y-1.5">
                      {toolGroups.builtin.map((t) => (
                        <div key={t.tool} className="flex items-center gap-2 text-xs">
                          <span className="w-32 shrink-0 truncate font-mono text-neutral-300" title={t.tool}>
                            {t.tool}
                          </span>
                          <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
                            <div
                              className={`h-full rounded ${toolColor(t.tool)}`}
                              style={{ width: `${Math.max((t.count / toolGroups.builtinMax) * 100, 2)}%` }}
                            />
                          </div>
                          <span className="w-12 shrink-0 text-right tabular-nums text-neutral-400">
                            {fmt(t.count)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* MCP tools, grouped by server */}
                <div>
                  <h3 className="mb-2 text-xs font-medium text-neutral-400">
                    MCP 도구 <span className="text-neutral-600">· {fmt(toolGroups.mcpTotal)}</span>
                  </h3>
                  {toolGroups.servers.length === 0 ? (
                    <p className="text-[11px] text-neutral-600">MCP 도구 호출 없음</p>
                  ) : (
                    <div className="space-y-3">
                      {toolGroups.servers.map((s) => (
                        <div key={s.server}>
                          <div className="mb-1 flex items-center gap-1.5 text-[11px]">
                            <span className="font-mono text-fuchsia-300">{s.server}</span>
                            <span className="text-neutral-600">· {fmt(s.total)}</span>
                          </div>
                          <div className="space-y-1.5">
                            {s.tools.map((x) => (
                              <div key={x.name} className="flex items-center gap-2 text-xs">
                                <span
                                  className="w-32 shrink-0 truncate font-mono text-neutral-400"
                                  title={x.name}
                                >
                                  {x.name}
                                </span>
                                <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
                                  <div
                                    className="h-full rounded bg-fuchsia-500"
                                    style={{ width: `${Math.max((x.count / toolGroups.mcpMax) * 100, 2)}%` }}
                                  />
                                </div>
                                <span className="w-12 shrink-0 text-right tabular-nums text-neutral-400">
                                  {fmt(x.count)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {insights.toolErrors.some((t) => t.errors > 0) && (
                <div className="mt-5 border-t border-neutral-800 pt-4">
                  <h3 className="mb-2 text-xs font-medium text-neutral-400">
                    ⚠️ 도구 오류율 <span className="text-neutral-600">· 차단·실패 결과 / 전체 결과 (차단된 hook 호출 포함)</span>
                  </h3>
                  <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    {insights.toolErrors
                      .filter((t) => t.errors > 0)
                      .slice(0, 12)
                      .map((t) => {
                        const rate = t.total ? (t.errors / t.total) * 100 : 0
                        return (
                          <div key={t.tool} className="flex items-center gap-2 text-xs">
                            <span className="w-32 shrink-0 truncate font-mono text-neutral-300" title={t.tool}>
                              {t.tool}
                            </span>
                            <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
                              <div
                                className="h-full rounded bg-red-500/70"
                                style={{ width: `${Math.max(rate, 2)}%` }}
                              />
                            </div>
                            <span className="w-20 shrink-0 text-right tabular-nums text-neutral-400">
                              {fmt(t.errors)}/{fmt(t.total)} ({rate.toFixed(0)}%)
                            </span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
              </>
            )}
          </div>

          {hasActivity && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
              <h2 className="mb-1 text-sm font-medium text-neutral-300">🕒 활동 히트맵 (요일 × 시간)</h2>
              <p className="mb-3 text-[11px] text-neutral-600">
                {provider === 'claude' ? '응답 메시지 기준' : provider === 'codex' ? '세션 시작 기준' : '메시지 기준'} · 로컬
                시간 · 전체 기간
              </p>
              <ActivityHeatmap data={insights.activity} />
            </div>
          )}

          {(insights.byBranch.length > 0 ||
            insights.byProject.length > 0 ||
            insights.stopReasons.length > 0 ||
            insights.skills.length > 0 ||
            insights.hotFiles.length > 0 ||
            insights.subagents.length > 0) && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-medium text-neutral-300">🧭 세션 인사이트</h2>
                  <p className="text-[11px] text-neutral-600">전체 기간 기준 (위 기간 필터와 무관)</p>
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-neutral-600">프로젝트·브랜치:</span>
                  {(['tokens', 'cost'] as const).map((mt) => (
                    <button
                      key={mt}
                      type="button"
                      onClick={() => setInsightMetric(mt)}
                      className={`rounded-full border px-2 py-0.5 ${
                        insightMetric === mt
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                          : 'border-neutral-700 text-neutral-500'
                      }`}
                    >
                      {mt === 'tokens' ? '토큰' : '비용'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <BarList
                  title={insightMetric === 'cost' ? '브랜치별 비용 (추정 USD)' : '브랜치별 토큰'}
                  items={groupItems(insights.byBranch, (g) => ({ label: g.key }))}
                  color="bg-emerald-500"
                  fmtValue={insightMetric === 'cost' ? usd : undefined}
                />
                <BarList
                  title={insightMetric === 'cost' ? '프로젝트별 비용 (추정 USD)' : '프로젝트별 토큰'}
                  items={groupItems(insights.byProject, (g) => ({ label: shortPath(g.key), title: g.key }))}
                  color="bg-sky-500"
                  fmtValue={insightMetric === 'cost' ? usd : undefined}
                />
                <BarList
                  title="스킬 · 슬래시 커맨드"
                  total={insights.skills.reduce((s, x) => s + x.count, 0)}
                  items={insights.skills.map((c) => ({ label: c.key, value: c.count }))}
                  color="bg-amber-500"
                />
                <BarList
                  title="서브에이전트"
                  total={insights.subagents.reduce((s, x) => s + x.count, 0)}
                  items={insights.subagents.map((c) => ({ label: c.key, value: c.count }))}
                  color="bg-fuchsia-500"
                />
                <BarList
                  title="종료 사유 (stop_reason)"
                  items={insights.stopReasons.map((c) => ({ label: c.key, value: c.count }))}
                  color="bg-neutral-500"
                />
                <BarList
                  title="자주 연 파일 (Read·Edit·Write)"
                  total={insights.hotFiles.reduce((s, x) => s + x.count, 0)}
                  items={insights.hotFiles.map((c) => ({
                    label: shortPath(c.key),
                    title: c.key,
                    value: c.count,
                  }))}
                  color="bg-blue-500"
                />
              </div>
            </div>
          )}

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
