'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message, Provider } from '@/lib/adapters/types'
import { MessageBubble } from './MessageBubble'
import { EmptyState } from '@/components/ui'
import { estimateCostUSD, isApprox } from '@/lib/pricing'
import { relativeTime, formatBytes } from '@/lib/format'

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
  let totalIn = 0
  let totalOut = 0
  let totalCost = 0
  let anyApprox = false
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
  }

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
            return (
              <div key={s.id} className="rounded-lg border border-border bg-surface">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  <span className="font-mono text-2xs text-fg-muted">{s.provider}</span>
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
