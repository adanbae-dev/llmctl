'use client'

import { useEffect, useRef, useState } from 'react'
import type { Session } from '@/lib/adapters/types'
import { MessageBubble } from './MessageBubble'
import { formatBytes } from '@/lib/format'
import { EmptyState, Skeleton } from '@/components/ui'

function fmt(n?: number): string {
  return (n ?? 0).toLocaleString()
}

function LoadingConversation() {
  return (
    <div className="h-full space-y-4 px-6 py-6">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="ml-auto h-12 w-1/2" />
      <Skeleton className="h-24 w-3/4" />
      <Skeleton className="ml-auto h-10 w-2/5" />
    </div>
  )
}

export function ConversationView({
  session,
  loading,
  hasSelection,
  scrollToId,
  scrollToNonce,
}: {
  session: Session | null
  loading: boolean
  hasSelection: boolean
  // Message id (uuid) to scroll to — e.g. a secret/PII match from the Security tab.
  scrollToId?: string | null
  // Bumped on every navigation so re-clicking the same match re-scrolls.
  scrollToNonce?: number
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [missed, setMissed] = useState(false)

  // After the target session renders, scroll its matched message into view and
  // briefly highlight it. If the anchor isn't on screen (large truncated session
  // or a non-rendered line), flag it instead of silently doing nothing.
  useEffect(() => {
    setMissed(false)
    if (!scrollToId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const raf = requestAnimationFrame(() => {
      const root = scrollRef.current
      if (!root) return // conversation not mounted yet (still loading) — wait for next run
      const el = root.querySelector<HTMLElement>(`[data-msg-id=${CSS.escape(scrollToId)}]`)
      if (!el) {
        setMissed(true)
        return
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFlashId(scrollToId)
      timer = setTimeout(() => setFlashId(null), 2200)
    })
    return () => {
      cancelAnimationFrame(raf)
      if (timer) clearTimeout(timer)
    }
  }, [scrollToId, scrollToNonce, session])

  if (!hasSelection)
    return (
      <EmptyState
        icon="💬"
        title="왼쪽에서 세션을 선택하세요"
        description="llmctl은 로컬의 Claude·Cursor·Codex 세션을 읽기 전용으로 보여줍니다. 원본 파일은 변경되지 않습니다."
      />
    )
  if (loading) return <LoadingConversation />
  if (!session)
    return (
      <EmptyState
        icon="⚠️"
        title="세션을 불러올 수 없습니다."
        description="파일이 이동·삭제됐거나 형식을 읽지 못했을 수 있습니다."
      />
    )

  // Mark messages where the model changed mid-session.
  const rows: { m: (typeof session.messages)[number]; switchedTo?: string }[] = []
  let prev: string | undefined
  for (const m of session.messages) {
    const switchedTo = m.model && prev && m.model !== prev ? m.model : undefined
    rows.push({ m, switchedTo })
    if (m.model) prev = m.model
  }

  const u = session.totalUsage
  const hasTokens = !!u && ((u.inputTokens ?? 0) > 0 || (u.outputTokens ?? 0) > 0)
  const models = session.modelsUsed?.length ? session.modelsUsed : session.model ? [session.model] : []

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-3">
        <h1 className="truncate text-base font-semibold text-fg-strong">{session.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
          <span className="font-mono text-fg-muted">{session.provider}</span>
          <span className="truncate">{session.projectPath}</span>
          {models.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {models.map((m) => (
                <span key={m} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-fg-muted">
                  {m}
                </span>
              ))}
            </span>
          )}
          <span>· {session.messages.length} msgs</span>
          {hasTokens ? (
            <span className="font-mono text-fg-muted" title="세션 토큰 합계">
              · 🪙 ↑{fmt(u!.inputTokens)} ↓{fmt(u!.outputTokens)}
            </span>
          ) : (
            <span className="text-fg-faint" title="이 제공자는 토큰 사용량을 기록하지 않습니다">
              · tokens —
            </span>
          )}
          {session.sizeBytes != null && <span>· {formatBytes(session.sizeBytes)}</span>}
        </div>
      </header>
      {session.truncated && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-xs text-amber-300">
          ⚠ 대용량 세션 — 시작 일부와 최근 메시지만 표시합니다 (중간 생략).
        </div>
      )}
      {missed && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-xs text-amber-300">
          ⚠ 매치된 메시지를 현재 보기에서 찾지 못했습니다 (대용량 세션은 시작·최근 일부만 표시).
        </div>
      )}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {rows.length === 0 && <EmptyState title="표시할 메시지가 없습니다." />}
        {rows.map(({ m, switchedTo }, i) => (
          <div
            key={`${m.id}-${i}`}
            data-msg-id={m.id}
            className={`scroll-mt-4 rounded-lg transition-shadow ${
              flashId === m.id ? 'ring-2 ring-brand/70 ring-offset-2 ring-offset-bg' : ''
            }`}
          >
            {switchedTo && (
              <div className="my-2 flex items-center gap-2 text-2xs text-amber-400/80">
                <span className="h-px flex-1 bg-amber-500/20" />
                ↪ 모델 변경: <span className="font-mono">{switchedTo}</span>
                <span className="h-px flex-1 bg-amber-500/20" />
              </div>
            )}
            <MessageBubble message={m} />
          </div>
        ))}
      </div>
    </div>
  )
}
