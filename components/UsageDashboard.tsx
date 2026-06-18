'use client'

import { useEffect, useMemo, useState } from 'react'
import { DateRangePicker } from './DateRangePicker'
import { Pill, EmptyState, Skeleton } from '@/components/ui'
import { estimateCostUSD, isApprox, ratesFor } from '@/lib/pricing'
import { fmt, fmtBytes, DOW, type UsageRow, type ToolRow, type Insights } from './usage/shared'
import { UsageOverview } from './usage/UsageOverview'
import { CostSection } from './usage/CostSection'
import { ToolsSection } from './usage/ToolsSection'
import { ActivitySection } from './usage/ActivitySection'
import { SessionsSection } from './usage/SessionsSection'

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

const EMPTY_INSIGHTS: Insights = {
  byProject: [],
  byBranch: [],
  stopReasons: [],
  skills: [],
  subagents: [],
  hotFiles: [],
  toolSeq: [],
  toolErrors: [],
  activity: [],
  activityByDate: [],
  sessions: [],
  cacheTtl: { ttl5m: 0, ttl1h: 0 },
}

export function UsageDashboard() {
  const [provider, setProvider] = useState<Provider>('claude')
  const [tab, setTab] = useState<Tab>('overview')
  const [rows, setRows] = useState<UsageRow[]>([])
  const [tools, setTools] = useState<ToolRow[]>([])
  const [insights, setInsights] = useState<Insights>(EMPTY_INSIGHTS)
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
          toolSeq: d.toolSeq ?? [],
          toolErrors: d.toolErrors ?? [],
          activity: d.activity ?? [],
          activityByDate: d.activityByDate ?? [],
          sessions: d.sessions ?? [],
          cacheTtl: d.cacheTtl ?? { ttl5m: 0, ttl1h: 0 },
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

  const totalCost = useMemo(() => filtered.reduce((sum, r) => sum + estimateCostUSD(r.model, r), 0), [filtered])
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

  const hasActivity = useMemo(() => insights.activity.some((row) => row.some((c) => c > 0)), [insights.activity])
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
        .map(([server, list]) => ({
          server,
          tools: list.sort((a, b) => b.count - a.count),
          total: list.reduce((s, x) => s + x.count, 0),
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
          {/* filter bar — date range + model toggles */}
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
                    sel.has(m) ? 'border-brand/50 bg-brand/10 text-brand' : 'border-border-strong text-fg-subtle'
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

          {tab === 'overview' && (
            <UsageOverview
              totals={totals}
              totalCost={totalCost}
              hasApprox={hasApprox}
              efficiency={efficiency}
              truncation={truncation}
              activityStats={activityStats}
              busiestDow={busiestDow}
              sessionsCount={insights.sessions.length}
            />
          )}
          {tab === 'cost' && (
            <CostSection
              costTrend={costTrend}
              models={models}
              modelTrend={modelTrend}
              sel={sel}
              perModel={perModel}
              byBranch={insights.byBranch}
              byProject={insights.byProject}
              cacheTtl={insights.cacheTtl}
              insightMetric={insightMetric}
              setInsightMetric={setInsightMetric}
            />
          )}
          {tab === 'tools' && (
            <ToolsSection
              hasTools={toolUsage.length > 0}
              toolGroups={toolGroups}
              toolErrors={insights.toolErrors}
              toolSeq={insights.toolSeq}
              skills={insights.skills}
              subagents={insights.subagents}
              stopReasons={insights.stopReasons}
              hotFiles={insights.hotFiles}
            />
          )}
          {tab === 'activity' && (
            <ActivitySection
              perDay={perDay}
              series={series}
              setSeries={setSeries}
              hasActivity={hasActivity}
              activity={insights.activity}
              activityByDate={insights.activityByDate}
              heatmapView={heatmapView}
              setHeatmapView={setHeatmapView}
              provider={provider}
              activityRange={activityRange}
            />
          )}
          {tab === 'sessions' && <SessionsSection sessions={insights.sessions} />}
        </>
      )}
    </div>
  )
}
