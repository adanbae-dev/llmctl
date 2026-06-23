'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message, Provider } from '@/lib/adapters/types'
import { MessageBubble } from './MessageBubble'
import { BarList, EmptyState, Sparkline } from '@/components/ui'
import { estimateCostUSD, isApprox } from '@/lib/pricing'
import { relativeTime, formatBytes } from '@/lib/format'
import {
  burnRate,
  pushSample,
  sessionState,
  throughputSeries,
  topTools,
  type RateSample,
} from '@/lib/live-metrics'

interface ActiveSession {
  id: string
  provider: Provider
  title: string
  projectPath: string
  sizeBytes: number
  updatedAt: string
}

interface TailResp {
  messages?: Message[]
  nextOffset?: number
  truncated?: boolean
  usage?: { inputTokens?: number; outputTokens?: number }
  error?: string
}

// Per-session live state. Offsets/totals are kept in a ref (source of truth) so
// the polling loop never reads stale closure state; a version bump re-renders.
interface Stream {
  offset: number
  // Codex reports cumulative usage; we diff against the first observed value so
  // the counter shows growth since the viewer opened.
  baseIn?: number
  baseOut?: number
  inTok: number
  outTok: number
  model?: string
  messages: Message[]
  lastUpdate: number
  // Live insights (accumulated since the viewer opened).
  toolCounts: Record<string, number> // tool_use calls by name
  toolErrors: number // tool_result blocks with isError
  samples: RateSample[] // cumulative output over time, for per-session burn rate
}

const TICK_MS = 2500
const LIST_EVERY = 3 // refresh the active list every Nth tick (~7.5s)
const MAX_MSGS = 40 // cap streamed messages per session card

function fmt(n: number): string {
  return n.toLocaleString()
}

export function LiveView({ onOpen }: { onOpen?: (provider: Provider, id: string) => void }) {
  const [active, setActive] = useState<ActiveSession[]>([])
  const [paused, setPaused] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [, setBump] = useState(0)

  const streamsRef = useRef<Record<string, Stream>>({})
  const activeRef = useRef<ActiveSession[]>([])
  const pausedRef = useRef(false)
  const aggSamplesRef = useRef<RateSample[]>([]) // aggregate output+cost over time
  activeRef.current = active
  pausedRef.current = paused

  const refreshList = useCallback(async () => {
    try {
      const r = await fetch('/api/live')
      const d = await r.json()
      const list: ActiveSession[] = d.sessions ?? []
      for (const s of list) {
        // New session: start at the current end so we stream only fresh output.
        if (!streamsRef.current[s.id]) {
          streamsRef.current[s.id] = {
            offset: s.sizeBytes,
            inTok: 0,
            outTok: 0,
            messages: [],
            lastUpdate: 0,
            toolCounts: {},
            toolErrors: 0,
            samples: [],
          }
        }
      }
      setActive(list)
      setErr(d.error ?? null)
    } catch (e) {
      setErr(String(e))
    }
  }, [])

  const tailOne = useCallback(async (s: ActiveSession) => {
    const st = streamsRef.current[s.id]
    if (!st) return
    try {
      const r = await fetch(
        `/api/live/tail?provider=${encodeURIComponent(s.provider)}&id=${encodeURIComponent(
          s.id,
        )}&offset=${st.offset}`,
      )
      const d: TailResp = await r.json()
      if (typeof d.nextOffset === 'number') st.offset = d.nextOffset
      const msgs = d.messages ?? []
      if (msgs.length) {
        for (const m of msgs) {
          if (m.model) st.model = m.model
          // Claude: per-message usage. (Codex messages carry none — handled below.)
          if (m.usage) {
            st.inTok += m.usage.inputTokens ?? 0
            st.outTok += m.usage.outputTokens ?? 0
          }
          for (const b of m.blocks) {
            if (b.kind === 'tool_use') st.toolCounts[b.name] = (st.toolCounts[b.name] ?? 0) + 1
            else if (b.kind === 'tool_result' && b.isError) st.toolErrors += 1
          }
        }
        st.messages = [...st.messages, ...msgs].slice(-MAX_MSGS)
        st.lastUpdate = Date.now()
      }
      // Codex: cumulative token_count → show growth since first observation.
      if (d.usage) {
        const ci = d.usage.inputTokens ?? 0
        const co = d.usage.outputTokens ?? 0
        if (st.baseIn == null) {
          st.baseIn = ci
          st.baseOut = co
        }
        st.inTok = Math.max(0, ci - (st.baseIn ?? 0))
        st.outTok = Math.max(0, co - (st.baseOut ?? 0))
        if (st.lastUpdate === 0) st.lastUpdate = Date.now()
      }
      // Sample cumulative output every tick so the rate decays when idle.
      st.samples = pushSample(st.samples, { t: Date.now(), out: st.outTok })
    } catch {
      // transient — next tick retries
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let tick = 0
    const run = async () => {
      if (cancelled || pausedRef.current || (typeof document !== 'undefined' && document.hidden))
        return
      if (tick % LIST_EVERY === 0) await refreshList()
      tick++
      await Promise.all(activeRef.current.map(tailOne))
      // Aggregate sample for the burn-rate + throughput sparkline.
      let aggOut = 0
      let aggCost = 0
      for (const s of activeRef.current) {
        const st = streamsRef.current[s.id]
        if (!st) continue
        aggOut += st.outTok
        aggCost += estimateCostUSD(st.model ?? s.provider, {
          input: st.inTok,
          output: st.outTok,
          cacheRead: 0,
          cacheCreate: 0,
        })
      }
      aggSamplesRef.current = pushSample(aggSamplesRef.current, {
        t: Date.now(),
        out: aggOut,
        cost: aggCost,
      })
      if (!cancelled) setBump((b) => b + 1)
    }
    run()
    const iv = setInterval(run, TICK_MS)
    const onVis = () => {
      if (!document.hidden) run()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refreshList, tailOne])

  // Aggregate live totals across the active sessions.
  const now = Date.now()
  let totalIn = 0
  let totalOut = 0
  let totalCost = 0
  let anyApprox = false
  const allTools: Record<string, number> = {}
  let allErrors = 0
  for (const s of active) {
    const st = streamsRef.current[s.id]
    if (!st) continue
    totalIn += st.inTok
    totalOut += st.outTok
    const model = st.model ?? s.provider
    totalCost += estimateCostUSD(model, {
      input: st.inTok,
      output: st.outTok,
      cacheRead: 0,
      cacheCreate: 0,
    })
    if (isApprox(model)) anyApprox = true
    for (const [k, v] of Object.entries(st.toolCounts)) allTools[k] = (allTools[k] ?? 0) + v
    allErrors += st.toolErrors
  }
  const burn = burnRate(aggSamplesRef.current)
  const spark = throughputSeries(aggSamplesRef.current)
  const tools = topTools(allTools)

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-base font-semibold text-fg-strong">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
          실시간 사용량
        </h1>
        <span className="text-2xs text-fg-faint">
          진행 중인 Claude·Codex 세션을 {Math.round(TICK_MS / 1000)}초마다 따라갑니다 (화면을 연 뒤 증분)
        </span>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="ml-auto rounded border border-border px-2 py-1 text-2xs text-fg-subtle transition-colors hover:border-brand/40 hover:text-brand"
        >
          {paused ? '▶ 재개' : '⏸ 일시정지'}
        </button>
      </div>

      {/* Aggregate counter */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-surface px-4 py-3">
        <span className="text-2xs text-fg-subtle">활성 세션</span>
        <span className="font-mono text-sm text-fg-strong">{active.length}</span>
        <span className="ml-2 text-2xs text-fg-subtle">라이브 토큰</span>
        <span className="font-mono text-sm text-fg-strong">
          ↑{fmt(totalIn)} ↓{fmt(totalOut)}
        </span>
        <span className="ml-2 text-2xs text-fg-subtle">추정 비용</span>
        <span className="font-mono text-sm text-data-cost">
          ${totalCost.toFixed(4)}
          {anyApprox && <span className="ml-1 text-2xs text-fg-faint">추정</span>}
        </span>
      </div>

      {/* Live insights: burn rate + throughput sparkline, live tool usage */}
      {active.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">번레이트 (최근 1분)</span>
              <span className="text-brand">
                <Sparkline values={spark.slice(-32)} />
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-lg text-fg-strong">
                {burn.ok ? `↓${Math.round(burn.tokPerMin).toLocaleString()}` : '—'}
                <span className="ml-1 text-2xs text-fg-faint">tok/분</span>
              </span>
              {burn.ok && (
                <span className="font-mono text-sm text-data-cost">
                  ~${burn.usdPerHour.toFixed(2)}/시
                  {anyApprox && <span className="ml-1 text-2xs text-fg-faint">추정</span>}
                </span>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-2xs text-fg-subtle">🛠 도구 사용 (라이브)</span>
              {allErrors > 0 && (
                <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-2xs font-medium text-red-400">
                  ⚠ 실패 {allErrors}
                </span>
              )}
            </div>
            {tools.length > 0 ? (
              <BarList title="" items={tools} color="bg-violet-500" />
            ) : (
              <p className="text-2xs text-fg-faint">아직 도구 호출 없음</p>
            )}
          </div>
        </div>
      )}

      {err && (
        <div className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          ⚠ {err}
        </div>
      )}

      {active.length === 0 ? (
        <EmptyState
          icon="🟢"
          title="현재 진행 중인 세션이 없습니다."
          description="Claude나 Codex를 사용하면 여기에 실시간으로 토큰·비용이 표시됩니다. (최근 5분 내 변경된 세션만 활성으로 봅니다.)"
        />
      ) : (
        <div className="space-y-4">
          {active.map((s) => {
            const st = streamsRef.current[s.id]
            const model = st?.model ?? s.provider
            const cost = st
              ? estimateCostUSD(model, {
                  input: st.inTok,
                  output: st.outTok,
                  cacheRead: 0,
                  cacheCreate: 0,
                })
              : 0
            const state = st ? sessionState(st.lastUpdate, now) : 'idle'
            const rate = st ? burnRate(st.samples) : null
            return (
              <div key={s.id} className="rounded-lg border border-border bg-surface">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  <span className="font-mono text-2xs text-fg-muted">{s.provider}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-2xs font-medium ${
                      state === 'generating'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-surface-2 text-fg-faint'
                    }`}
                  >
                    {state === 'generating' ? '생성 중' : '대기'}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-fg-strong" title={s.title}>
                    {s.title || '(untitled)'}
                  </span>
                  <span className="truncate text-2xs text-fg-subtle" title={s.projectPath}>
                    {s.projectPath}
                  </span>
                  <span className="ml-auto flex items-center gap-3 text-2xs">
                    <span className="font-mono text-fg-muted">
                      ↑{fmt(st?.inTok ?? 0)} ↓{fmt(st?.outTok ?? 0)}
                    </span>
                    <span className="font-mono text-data-cost">${cost.toFixed(4)}</span>
                    <span className="text-fg-faint">{formatBytes(s.sizeBytes)}</span>
                    {onOpen && (
                      <button
                        type="button"
                        onClick={() => onOpen(s.provider, s.id)}
                        className="rounded border border-border px-1.5 py-0.5 text-fg-subtle transition-colors hover:border-brand/40 hover:text-brand"
                      >
                        전체 보기
                      </button>
                    )}
                  </span>
                </div>
                <div className="px-4 py-2 text-2xs text-fg-faint">
                  {st && st.lastUpdate > 0
                    ? `스트리밍 중 · ${relativeTime(new Date(st.lastUpdate).toISOString())}`
                    : '새 메시지 대기 중…'}
                  {rate?.ok && (
                    <span className="ml-1 font-mono text-fg-subtle">
                      · ↓{Math.round(rate.tokPerMin).toLocaleString()} tok/분
                    </span>
                  )}
                </div>
                {st && st.messages.length > 0 && (
                  <div className="max-h-80 space-y-2 overflow-y-auto px-4 pb-4">
                    {st.messages.map((m, i) => (
                      <MessageBubble key={`${m.id}-${i}`} message={m} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
