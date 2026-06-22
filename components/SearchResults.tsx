'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { Provider } from '@/lib/adapters/types'
import { EmptyState, Skeleton, Badge } from '@/components/ui'

interface SearchMatch {
  messageId: string
  role: string
  snippet: string
}
interface SearchHit {
  id: string
  provider: Provider
  title: string
  project: string
  date: string
  matchCount: number
  matches: SearchMatch[]
}

const ROLE_LABEL: Record<string, string> = {
  user: '🙂 사용자',
  assistant: '🤖 어시스턴트',
  system: '⚙️ 시스템',
  tool: '🔧 도구',
}

const shortPath = (p: string) => {
  const parts = p.split('/').filter(Boolean)
  return parts.length <= 2 ? p : '…/' + parts.slice(-2).join('/')
}

// Wrap each case-insensitive occurrence of the query in a <mark>.
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const out: ReactNode[] = []
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  let i = 0
  let k = 0
  for (;;) {
    const idx = lower.indexOf(ql, i)
    if (idx < 0) {
      out.push(text.slice(i))
      break
    }
    if (idx > i) out.push(text.slice(i, idx))
    out.push(
      <mark key={k++} className="rounded bg-brand/30 px-0.5 text-fg-strong">
        {text.slice(idx, idx + q.length)}
      </mark>,
    )
    i = idx + q.length
  }
  return <>{out}</>
}

/** Cross-session search results. Each match jumps to its message in the 💬 세션
 *  view (reuses the conversation-view scroll anchor). */
export function SearchResults({
  query,
  onOpen,
}: {
  query: string
  onOpen: (provider: Provider, id: string, anchor?: string) => void
}) {
  const [hits, setHits] = useState<SearchHit[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [meta, setMeta] = useState<{ parsed: number; capped: boolean }>({ parsed: 0, capped: false })

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setStatus('idle')
      setHits([])
      return
    }
    let cancelled = false
    setStatus('loading')
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (Array.isArray(d.hits)) {
          setHits(d.hits)
          setMeta({ parsed: d.parsed ?? 0, capped: !!d.capped })
          setStatus('ok')
        } else setStatus('error')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [query])

  if (status === 'idle')
    return (
      <EmptyState
        icon="🔍"
        title="모든 세션에서 검색"
        description="상단 검색창에 두 글자 이상 입력하면 대화·도구 호출·결과 전체에서 찾아, 해당 메시지로 바로 이동합니다."
      />
    )
  if (status === 'loading')
    return (
      <div className="space-y-3 px-6 py-6">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-2/3" />
      </div>
    )
  if (status === 'error')
    return (
      <EmptyState icon="⚠️" title="검색에 실패했습니다." description="잠시 후 다시 시도해 주세요." />
    )
  if (hits.length === 0)
    return (
      <EmptyState
        icon="🔍"
        title={`"${query.trim()}" 결과 없음`}
        description="다른 검색어를 시도하거나 더 짧게 입력해 보세요."
      />
    )

  const totalMatches = hits.reduce((s, h) => s + h.matchCount, 0)

  return (
    <div className="space-y-2 px-6 py-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
        <span className="text-fg-muted">
          <span className="font-mono text-fg-strong">{query.trim()}</span> · {hits.length.toLocaleString()}개 세션 ·{' '}
          {totalMatches.toLocaleString()}개 메시지
        </span>
        {meta.capped && (
          <Badge tone="danger">상위 {meta.parsed.toLocaleString()}개 세션만 검색 (결과 일부)</Badge>
        )}
      </div>
      <ul className="space-y-2">
        {hits.map((h) => (
          <li key={`${h.provider}-${h.id}`} className="rounded-lg border border-border bg-surface p-2.5">
            <button
              type="button"
              onClick={() => onOpen(h.provider, h.id, h.matches[0]?.messageId)}
              title="세션 열기 (첫 매치로 이동)"
              className="flex w-full items-center gap-2 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg-strong">
                {h.title || '(제목 없음)'}
              </span>
              <span className="shrink-0 font-mono text-2xs text-fg-faint">{h.provider}</span>
              <Badge tone="info">{h.matchCount.toLocaleString()}건</Badge>
            </button>
            <div className="mt-0.5 flex items-center gap-2 text-2xs text-fg-faint">
              <span className="min-w-0 flex-1 truncate font-mono" title={h.project}>
                {h.project ? shortPath(h.project) : '(알 수 없는 프로젝트)'}
              </span>
              <span className="shrink-0 tabular-nums">{h.date || '—'}</span>
            </div>
            <ul className="mt-1.5 space-y-1">
              {h.matches.map((m, i) => (
                <li key={`${m.messageId}-${i}`}>
                  <button
                    type="button"
                    onClick={() => onOpen(h.provider, h.id, m.messageId)}
                    title="이 메시지로 이동"
                    className="block w-full rounded border border-transparent px-2 py-1 text-left text-2xs text-fg-muted transition-colors hover:border-brand/40 hover:bg-surface-2"
                  >
                    <span className="mr-1.5 font-mono text-fg-subtle">{ROLE_LABEL[m.role] ?? m.role}</span>
                    <Highlight text={m.snippet} q={query.trim()} /> <span className="text-brand">↗</span>
                  </button>
                </li>
              ))}
              {h.matchCount > h.matches.length && (
                <li className="px-2 text-2xs text-fg-faint">+{(h.matchCount - h.matches.length).toLocaleString()}개 더…</li>
              )}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
