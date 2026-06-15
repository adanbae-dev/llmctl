import type { Session } from '@/lib/adapters/types'
import { MessageBubble } from './MessageBubble'
import { formatBytes } from '@/lib/format'

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-600">{text}</div>
  )
}

function fmt(n?: number): string {
  return (n ?? 0).toLocaleString()
}

export function ConversationView({
  session,
  loading,
  hasSelection,
}: {
  session: Session | null
  loading: boolean
  hasSelection: boolean
}) {
  if (!hasSelection) return <Empty text="← 왼쪽에서 세션을 선택하세요" />
  if (loading) return <Empty text="불러오는 중…" />
  if (!session) return <Empty text="세션을 불러올 수 없습니다." />

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
      <header className="border-b border-neutral-800 px-6 py-3">
        <h1 className="truncate text-base font-semibold">{session.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span className="font-mono text-neutral-400">{session.provider}</span>
          <span className="truncate">{session.projectPath}</span>
          {models.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {models.map((m) => (
                <span key={m} className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-300">
                  {m}
                </span>
              ))}
            </span>
          )}
          <span>· {session.messages.length} msgs</span>
          {hasTokens ? (
            <span className="font-mono text-neutral-400" title="세션 토큰 합계">
              · 🪙 ↑{fmt(u!.inputTokens)} ↓{fmt(u!.outputTokens)}
            </span>
          ) : (
            <span className="text-neutral-700" title="이 제공자는 토큰 사용량을 기록하지 않습니다">
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
      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {rows.length === 0 && <Empty text="표시할 메시지가 없습니다." />}
        {rows.map(({ m, switchedTo }, i) => (
          <div key={`${m.id}-${i}`}>
            {switchedTo && (
              <div className="my-2 flex items-center gap-2 text-[11px] text-amber-400/80">
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
