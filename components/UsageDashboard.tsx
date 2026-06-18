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
import { BarList, Section, Stat, Pill, Badge, InfoDot, EmptyState, Skeleton } from '@/components/ui'
import { GLOSSARY } from '@/lib/glossary'
import { estimateCostUSD, isApprox, ratesFor } from '@/lib/pricing'

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

interface SessionStat {
  id: string
  project: string
  date: string
  cost: number
  sizeBytes: number
}

type Provider = 'claude' | 'cursor' | 'codex'
const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'codex', label: 'Codex / GPT' },
]

const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'cost', label: '비용' },
  { id: 'tools', label: '도구·워크플로' },
  { id: 'activity', label: '활동' },
  { id: 'sessions', label: '세션' },
] as const
type Tab = (typeof TABS)[number]['id']

const fmt = (n: number) => n.toLocaleString()
const usd = (n: number) => `$${n.toFixed(2)}`
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const MODEL_COLORS = ['#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f472b6', '#22d3ee', '#fb923c', '#a3e635']

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

function shortPath(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts.length <= 2 ? p : '…/' + parts.slice(-2).join('/')
}

/** Activity heatmap: 7 weekdays × 24 hours, intensity scaled to the busiest cell. */
function ActivityHeatmap({ data }: { data: number[][] }) {
  if (!data || data.length === 0) return null
  const max = Math.max(1, ...data.flat())
  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex">
          <div className="w-8 shrink-0" />
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="w-[22px] shrink-0 text-center text-[10px] text-neutral-600">
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {data.map((row, dow) => (
          <div key={dow} className="flex items-center">
            <div className="w-8 shrink-0 text-[11px] text-neutral-500">{DOW[dow]}</div>
            {row.map((c, h) => (
              <div
                key={h}
                className="m-[1px] h-[20px] w-[20px] shrink-0 rounded-sm"
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

/** Calendar heatmap (GitHub-style): weeks as columns × 7 weekday rows, full date range. */
function CalendarHeatmap({ data }: { data: { date: string; count: number }[] }) {
  if (!data || data.length === 0) return null
  const max = Math.max(1, ...data.map((d) => d.count))
  const byDate = new Map(data.map((d) => [d.date, d.count]))
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const fmtDate = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  const start = parse(data[0].date)
  const end = parse(data[data.length - 1].date)
  const cur = new Date(start)
  cur.setDate(cur.getDate() - cur.getDay()) // back to Sunday of the first week
  const weeks: { date: string; count: number; inRange: boolean }[][] = []
  while (cur <= end) {
    const week: { date: string; count: number; inRange: boolean }[] = []
    for (let i = 0; i < 7; i++) {
      const ds = fmtDate(cur)
      week.push({ date: ds, count: byDate.get(ds) ?? 0, inRange: cur >= start && cur <= end })
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }
  const monthOf = (w: { date: string; inRange: boolean }[]) => parse((w.find((d) => d.inRange) ?? w[0]).date).getMonth()
  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex pl-8">
          {weeks.map((w, i) => {
            const m = monthOf(w)
            const show = i === 0 || monthOf(weeks[i - 1]) !== m
            return (
              <div key={i} className="w-[15px] shrink-0 text-[9px] text-neutral-500">
                {show ? `${m + 1}월` : ''}
              </div>
            )
          })}
        </div>
        <div className="flex">
          <div className="mr-1 flex flex-col">
            {DOW.map((d, i) => (
              <div key={i} className="h-[15px] w-7 text-[9px] leading-[15px] text-neutral-500">
                {i % 2 === 1 ? d : ''}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col">
              {week.map((d, di) => (
                <div
                  key={di}
                  className="m-[1px] h-[13px] w-[13px] rounded-sm"
                  title={d.inRange ? `${d.date} · ${d.count.toLocaleString()}` : ''}
                  style={{
                    backgroundColor: !d.inRange
                      ? 'transparent'
                      : d.count === 0
                        ? 'rgba(255,255,255,0.04)'
                        : `rgba(52,211,153,${0.15 + 0.85 * (d.count / max)})`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function UsageDashboard() {
  const [provider, setProvider] = useState<Provider>('claude')
  const [tab, setTab] = useState<Tab>('overview')
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
    activityByDate: { date: string; count: number }[]
    sessions: SessionStat[]
  }>({
    byProject: [],
    byBranch: [],
    stopReasons: [],
    skills: [],
    subagents: [],
    hotFiles: [],
    toolErrors: [],
    activity: [],
    activityByDate: [],
    sessions: [],
  })
  const [insightMetric, setInsightMetric] = useState<'tokens' | 'cost'>('tokens')
  const [heatmapView, setHeatmapView] = useState<'dow' | 'date'>('dow')
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
          activityByDate: d.activityByDate ?? [],
          sessions: d.sessions ?? [],
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
  const activityRange = insights.activityByDate.length
    ? `${insights.activityByDate[0].date} ~ ${insights.activityByDate[insights.activityByDate.length - 1].date}`
    : '전체 기간'

  const busiestDow = useMemo(() => {
    const a = insights.activity
    if (!a.length) return null
    let best = 0
    let bestSum = -1
    a.forEach((row, i) => {
      const s = row.reduce((x, y) => x + y, 0)
      if (s > bestSum) {
        bestSum = s
        best = i
      }
    })
    return bestSum > 0 ? DOW[best] : null
  }, [insights.activity])

  // Daily output tokens pivoted by model — stacked share-over-time (respects filters).
  const modelTrend = useMemo(() => {
    const m = new Map<string, Record<string, number | string>>()
    for (const r of filtered) {
      const e = m.get(r.date) ?? { date: r.date }
      e[r.model] = (Number(e[r.model]) || 0) + r.output
      m.set(r.date, e)
    }
    return [...m.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [filtered])

  const efficiency = useMemo(() => {
    let saved = 0
    for (const r of filtered) saved += (r.cacheRead * ratesFor(r.model).input * 0.9) / 1_000_000
    return { saved, outIn: totals.input ? totals.output / totals.input : 0 }
  }, [filtered, totals])

  const truncation = useMemo(() => {
    const total = insights.stopReasons.reduce((s, x) => s + x.count, 0)
    const trunc = insights.stopReasons
      .filter((s) => /max_tokens|max_output|length/i.test(s.key))
      .reduce((s, x) => s + x.count, 0)
    return { total, rate: total ? (trunc / total) * 100 : 0 }
  }, [insights.stopReasons])

  const activityStats = useMemo(() => {
    const days = insights.activityByDate
    if (!days.length) return null
    const toMs = (s: string) => {
      const [y, mo, d] = s.split('-').map(Number)
      return new Date(y, mo - 1, d).getTime()
    }
    let longest = 1
    let cur = 1
    for (let i = 1; i < days.length; i++) {
      const gap = Math.round((toMs(days[i].date) - toMs(days[i - 1].date)) / 86_400_000)
      if (gap === 1) {
        cur += 1
        longest = Math.max(longest, cur)
      } else {
        cur = 1
      }
    }
    const total = days.reduce((s, x) => s + x.count, 0)
    const busiest = days.reduce((a, b) => (b.count > a.count ? b : a))
    return { activeDays: days.length, longest, busiest, avg: total / days.length }
  }, [insights.activityByDate])

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

  const cacheHitRate = (
    (totals.cacheRead / Math.max(totals.input + totals.cacheRead + totals.cacheCreate, 1)) * 100
  ).toFixed(0)

  const narrative = `이 기간 ${hasApprox ? '≈ ' : ''}$${totalCost.toFixed(2)} · 출력 ${fmt(totals.output)} 토큰${
    busiestDow ? ` · 최다 활동 ${busiestDow}요일` : ''
  }${insights.sessions.length ? ` · 주목 세션 ${insights.sessions.length}개 (세션 탭)` : ''}`

  const hasWorkflowInsights =
    insights.skills.length > 0 ||
    insights.subagents.length > 0 ||
    insights.stopReasons.length > 0 ||
    insights.hotFiles.length > 0
  const hasCostGroups = insights.byBranch.length > 0 || insights.byProject.length > 0

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-fg-strong">📊 사용량 · 비용</h1>
          <p className="mt-0.5 text-2xs text-fg-faint">제공자별 전 세션 합계 · 토큰 사용량과 추정 비용</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={doBackup}
            disabled={backupBusy}
            title="Claude·Codex·Gemini 세션을 ~/.llmctl/archive 로 증분 백업 (원본은 읽기 전용)"
            className="shrink-0 rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2 disabled:opacity-50"
          >
            {backupBusy ? '백업 중…' : '💾 백업'}
          </button>
          {backupMsg && (
            <span className={`text-2xs ${backupErr ? 'text-danger' : 'text-fg-subtle'}`}>{backupMsg}</span>
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
              provider === p.id ? 'bg-surface-2 text-fg-strong' : 'text-fg-subtle hover:text-fg-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[68px]" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="📭"
          title="이 제공자는 토큰 사용량 데이터가 없습니다."
          description="다른 제공자를 선택하거나, 세션을 백업한 뒤 다시 확인하세요."
        />
      ) : (
        <>
          {/* filter bar — date range + model toggles (apply to token/cost/activity charts) */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-3 text-xs">
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
                      ? 'border-brand/50 bg-brand/10 text-brand'
                      : 'border-border-strong text-fg-subtle'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* subtab nav — progressive disclosure */}
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <Pill key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </Pill>
            ))}
          </div>

          {/* ─── OVERVIEW ─── */}
          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[1.3fr_2.7fr]">
                <Stat
                  size="lg"
                  tone="cost"
                  label={
                    <>
                      추정 비용 (USD)
                      <InfoDot label={hasApprox ? `${GLOSSARY.cost} ${GLOSSARY.costApprox}` : GLOSSARY.cost} />
                      <Badge tone="cost">추정</Badge>
                    </>
                  }
                  value={`${hasApprox ? '≈ ' : ''}$${totalCost.toFixed(2)}`}
                />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <Stat
                    tone="output"
                    label="출력 토큰 (생성)"
                    value={fmt(totals.output)}
                    hint={<InfoDot label={GLOSSARY.output} />}
                  />
                  <Stat label="입력 토큰" value={fmt(totals.input)} hint={<InfoDot label={GLOSSARY.input} />} />
                  <Stat label="캐시 read" value={fmt(totals.cacheRead)} hint={<InfoDot label={GLOSSARY.cacheRead} />} />
                  <Stat
                    tone="cache"
                    label="캐시 적중률"
                    value={`${cacheHitRate}%`}
                    hint={<InfoDot label={GLOSSARY.cacheHit} />}
                  />
                  <Stat label="메시지 수" value={fmt(totals.messages)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Stat
                  tone="output"
                  label="캐시 절약 (추정)"
                  value={`≈ $${efficiency.saved.toFixed(2)}`}
                  hint={<InfoDot label={GLOSSARY.cacheSaved} />}
                />
                <Stat
                  label="출력/입력 비율"
                  value={efficiency.outIn.toFixed(3)}
                  hint={<InfoDot label={GLOSSARY.outInRatio} />}
                />
                {truncation.total > 0 && (
                  <Stat
                    tone={truncation.rate > 5 ? 'danger' : 'default'}
                    label="잘림율 (max_tokens·전체)"
                    value={`${truncation.rate.toFixed(1)}%`}
                    hint={<InfoDot label={GLOSSARY.truncation} />}
                  />
                )}
                {activityStats && (
                  <Stat tone="cache" label="최장 연속·활동일" value={`${activityStats.longest}·${activityStats.activeDays}일`} />
                )}
                {activityStats && <Stat label="가장 바쁜 날" value={activityStats.busiest.date} />}
              </div>

              <p className="text-2xs leading-relaxed text-fg-subtle">
                {narrative}. 비용은 추정치이며 ‘≈’는 단가 미검증을 뜻합니다.
              </p>
            </div>
          )}

          {/* ─── COST ─── */}
          {tab === 'cost' && (
            <div className="space-y-6">
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
                <Section
                  title="📈 모델 점유율 추이"
                  description="일자별 출력(생성) 토큰을 모델별로 누적 · 기간·모델 필터 반영"
                >
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
                  </div>
                </Section>
              )}
            </div>
          )}

          {/* ─── TOOLS / WORKFLOW ─── */}
          {tab === 'tools' && (
            <div className="space-y-6">
              <Section title="🔧 도구 사용">
                {toolUsage.length === 0 ? (
                  <p className="text-2xs text-fg-faint">이 제공자는 도구 호출 데이터가 없습니다.</p>
                ) : (
                  <>
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <h3 className="mb-2 text-xs font-medium text-fg-muted">
                          기본 도구 <span className="text-fg-faint">· {fmt(toolGroups.builtinTotal)}</span>
                        </h3>
                        {toolGroups.builtin.length === 0 ? (
                          <p className="text-2xs text-fg-faint">없음</p>
                        ) : (
                          <div className="space-y-1.5">
                            {toolGroups.builtin.map((t) => (
                              <div key={t.tool} className="flex items-center gap-2 text-xs">
                                <span className="w-32 shrink-0 truncate font-mono text-fg-muted" title={t.tool}>
                                  {t.tool}
                                </span>
                                <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
                                  <div
                                    className={`h-full rounded ${toolColor(t.tool)}`}
                                    style={{ width: `${Math.max((t.count / toolGroups.builtinMax) * 100, 2)}%` }}
                                  />
                                </div>
                                <span className="w-12 shrink-0 text-right tabular-nums text-fg-muted">{fmt(t.count)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h3 className="mb-2 text-xs font-medium text-fg-muted">
                          MCP 도구 <span className="text-fg-faint">· {fmt(toolGroups.mcpTotal)}</span>
                        </h3>
                        {toolGroups.servers.length === 0 ? (
                          <p className="text-2xs text-fg-faint">MCP 도구 호출 없음</p>
                        ) : (
                          <div className="space-y-3">
                            {toolGroups.servers.map((s) => (
                              <div key={s.server}>
                                <div className="mb-1 flex items-center gap-1.5 text-2xs">
                                  <span className="font-mono text-data-mcp">{s.server}</span>
                                  <span className="text-fg-faint">· {fmt(s.total)}</span>
                                </div>
                                <div className="space-y-1.5">
                                  {s.tools.map((x) => (
                                    <div key={x.name} className="flex items-center gap-2 text-xs">
                                      <span className="w-32 shrink-0 truncate font-mono text-fg-subtle" title={x.name}>
                                        {x.name}
                                      </span>
                                      <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
                                        <div
                                          className="h-full rounded bg-fuchsia-500"
                                          style={{ width: `${Math.max((x.count / toolGroups.mcpMax) * 100, 2)}%` }}
                                        />
                                      </div>
                                      <span className="w-12 shrink-0 text-right tabular-nums text-fg-muted">
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
                      <div className="mt-5 border-t border-border pt-4">
                        <h3 className="mb-2 flex items-center gap-1 text-xs font-medium text-fg-muted">
                          ⚠️ 도구 오류율
                          <span className="text-fg-faint">· 차단·실패 결과 / 전체 결과</span>
                          <InfoDot label={GLOSSARY.toolError} />
                        </h3>
                        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                          {insights.toolErrors
                            .filter((t) => t.errors > 0)
                            .slice(0, 12)
                            .map((t) => {
                              const rate = t.total ? (t.errors / t.total) * 100 : 0
                              return (
                                <div key={t.tool} className="flex items-center gap-2 text-xs">
                                  <span className="w-32 shrink-0 truncate font-mono text-fg-muted" title={t.tool}>
                                    {t.tool}
                                  </span>
                                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
                                    <div className="h-full rounded bg-red-500/70" style={{ width: `${Math.max(rate, 2)}%` }} />
                                  </div>
                                  <span className="w-20 shrink-0 text-right tabular-nums text-fg-muted">
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
              </Section>

              {hasWorkflowInsights && (
                <Section title="🧭 워크플로 인사이트" description={GLOSSARY.wholeRange}>
                  <div className="grid gap-6 md:grid-cols-2">
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
                      items={insights.hotFiles.map((c) => ({ label: shortPath(c.key), title: c.key, value: c.count }))}
                      color="bg-blue-500"
                    />
                  </div>
                </Section>
              )}
            </div>
          )}

          {/* ─── ACTIVITY ─── */}
          {tab === 'activity' && (
            <div className="space-y-6">
              <Section
                title="일자별 토큰"
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        { key: 'output', label: '출력' },
                        { key: 'input', label: '입력' },
                        { key: 'cacheRead', label: '캐시read' },
                      ] as const
                    ).map((s) => (
                      <Pill
                        key={s.key}
                        active={series[s.key]}
                        onClick={() => setSeries((p) => ({ ...p, [s.key]: !p[s.key] }))}
                      >
                        {s.label}
                      </Pill>
                    ))}
                  </div>
                }
              >
                <p className="mb-3 text-2xs text-fg-faint">캐시 read는 출력·입력보다 보통 10~100배 커서 기본 비표시</p>
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
              </Section>

              {hasActivity && (
                <Section
                  title="🕒 활동 히트맵"
                  description={`${
                    provider === 'claude' ? '응답 메시지 기준' : provider === 'codex' ? '세션 시작 기준' : '메시지 기준'
                  } · 로컬 시간 · ${activityRange}`}
                  actions={
                    <div className="flex items-center gap-1">
                      {(
                        [
                          ['dow', '요일 × 시간'],
                          ['date', '날짜별'],
                        ] as const
                      ).map(([v, label]) => (
                        <Pill key={v} active={heatmapView === v} onClick={() => setHeatmapView(v)}>
                          {label}
                        </Pill>
                      ))}
                    </div>
                  }
                >
                  {heatmapView === 'dow' ? (
                    <ActivityHeatmap data={insights.activity} />
                  ) : (
                    <CalendarHeatmap data={insights.activityByDate} />
                  )}
                </Section>
              )}
            </div>
          )}

          {/* ─── SESSIONS ─── */}
          {tab === 'sessions' &&
            (insights.sessions.length > 0 ? (
              <Section title="🗂 세션 Top-N (정리 후보)" description="전체 기간 · 세션 = 파일 1개 · 삭제는 💬 세션 탭에서">
                <div className="grid gap-6 md:grid-cols-2">
                  <BarList
                    title="가장 비싼 세션 (추정 USD)"
                    items={[...insights.sessions]
                      .sort((a, b) => b.cost - a.cost)
                      .slice(0, 15)
                      .map((s) => ({ label: `${shortPath(s.project)} · ${s.date}`, title: s.project, value: s.cost }))}
                    color="bg-amber-500"
                    fmtValue={usd}
                  />
                  <BarList
                    title="가장 큰 세션 (용량)"
                    items={[...insights.sessions]
                      .sort((a, b) => b.sizeBytes - a.sizeBytes)
                      .slice(0, 15)
                      .map((s) => ({ label: `${shortPath(s.project)} · ${s.date}`, title: s.project, value: s.sizeBytes }))}
                    color="bg-rose-500"
                    fmtValue={fmtBytes}
                  />
                </div>
              </Section>
            ) : (
              <EmptyState
                title="세션 인사이트가 없습니다"
                description="이 제공자는 세션 단위 비용/용량 데이터를 제공하지 않습니다."
              />
            ))}
        </>
      )}
    </div>
  )
}
