'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Section, EmptyState, Badge, InfoDot, Skeleton } from '@/components/ui'
import { fmt, fmtBytes, shortPath, type CountRow, type SecretHit } from './shared'
import type { Session } from '@/lib/adapters/types'

const day = (iso?: string) => (iso ? iso.slice(0, 10) : '—')

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-14 shrink-0 text-fg-faint">{label}</span>
      <span className="min-w-0 flex-1 break-all text-fg-muted">{children}</span>
    </div>
  )
}

/** Inline detail for one suspected session: fetches the parsed session by id
 *  (same locator the viewer uses) and shows its metadata + this session's
 *  per-type match breakdown, without leaving the Security tab. */
function SessionDetail({
  hit,
  selected,
  onOpenSession,
}: {
  hit: SecretHit
  selected: string
  onOpenSession?: (id: string, anchor?: string) => void
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    fetch(`/api/sessions/claude/${encodeURIComponent(hit.id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d.session) {
          setSession(d.session)
          setStatus('ok')
        } else setStatus('error')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [hit.id])

  return (
    <div className="mb-1.5 ml-1 rounded border border-border bg-surface-2 p-3 text-2xs">
      {status === 'loading' && (
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      )}
      {status === 'error' && (
        <p className="text-fg-subtle">
          세션을 불러오지 못했습니다 — 파일이 이동·삭제됐거나 형식을 읽지 못했을 수 있습니다.
        </p>
      )}
      {status === 'ok' && session && (
        <div className="space-y-1">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-fg-strong" title={session.title}>
              {session.title || '(제목 없음)'}
            </span>
            {session.archived && <Badge tone="neutral">보관본</Badge>}
          </div>
          <DetailRow label="경로">{session.projectPath || hit.project || '—'}</DetailRow>
          <DetailRow label="기간">
            {day(session.startedAt) === day(session.updatedAt)
              ? day(session.startedAt)
              : `${day(session.startedAt)} → ${day(session.updatedAt)}`}
          </DetailRow>
          <DetailRow label="모델">
            {(session.modelsUsed?.length
              ? session.modelsUsed
              : session.model
                ? [session.model]
                : ['—']
            ).join(', ')}
          </DetailRow>
          <DetailRow label="메시지">{fmt(session.messageCount ?? session.messages.length)}개</DetailRow>
          <DetailRow label="토큰">
            {session.totalUsage &&
            ((session.totalUsage.inputTokens ?? 0) > 0 || (session.totalUsage.outputTokens ?? 0) > 0)
              ? `입력 ${fmt(session.totalUsage.inputTokens ?? 0)} · 출력 ${fmt(session.totalUsage.outputTokens ?? 0)}`
              : '—'}
          </DetailRow>
          <DetailRow label="용량">{fmtBytes(session.sizeBytes ?? 0)}</DetailRow>
          <div className="mt-2 border-t border-border/60 pt-2">
            <span className="text-fg-faint">
              의심 매치 ({fmt(hit.total)}건)
              {onOpenSession && <span className="ml-1">· 유형을 누르면 해당 메시지로 이동</span>}
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {hit.types.map((t) => {
                const anchor = hit.matches.find((m) => m.type === t.key)?.messageId
                const sel = t.key === selected
                const cls = `rounded-full border px-2 py-0.5 ${
                  sel ? 'border-brand/50 bg-brand/10 text-brand' : 'border-border-strong text-fg-subtle'
                }`
                return onOpenSession ? (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => onOpenSession(hit.id, anchor)}
                    title={anchor ? `💬 세션에서 "${t.key}" 매치로 이동` : '세션 열기 (메시지 위치 불명)'}
                    className={`${cls} transition-colors hover:border-brand/50 hover:text-brand`}
                  >
                    {t.key} · {fmt(t.count)} ↗
                  </button>
                ) : (
                  <span key={t.key} className={cls}>
                    {t.key} · {fmt(t.count)}
                  </span>
                )
              })}
            </div>
          </div>
          {onOpenSession ? (
            <button
              type="button"
              onClick={() =>
                onOpenSession(
                  hit.id,
                  hit.matches.find((m) => m.type === selected)?.messageId ?? hit.matches[0]?.messageId,
                )
              }
              className="mt-2 inline-flex items-center gap-1 rounded border border-brand/40 bg-brand/10 px-2 py-1 text-brand transition-colors hover:bg-brand/20"
            >
              💬 세션에서 이 매치 보기 →
            </button>
          ) : (
            <p className="mt-2 text-fg-faint">전체 대화는 💬 세션 탭에서 동일 세션을 열어 확인하세요.</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Pattern-based secret/PII scan results (Claude). Defensive: helps users find
 *  credentials accidentally left in their own local session logs. Regex-only,
 *  so always framed as an estimate that may include false positives.
 *
 *  Selecting a match type drills into the suspected sessions; clicking a session
 *  expands an inline detail panel with that session's info. */
export function SecuritySection({
  provider,
  secrets,
  secretSessions,
  secretHits,
  onOpenSession,
}: {
  provider: 'claude' | 'cursor' | 'codex'
  secrets: CountRow[]
  secretSessions: number
  secretHits: SecretHit[]
  // Jump to a session's matched message in the 💬 세션 view.
  onOpenSession?: (id: string, anchor?: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  if (provider !== 'claude')
    return (
      <EmptyState
        icon="🔐"
        title="이 제공자는 시크릿 스캔을 지원하지 않습니다."
        description="현재 시크릿·PII 스캔은 Claude 세션 로그만 대상으로 합니다."
      />
    )
  const total = secrets.reduce((s, x) => s + x.count, 0)
  if (total === 0)
    return (
      <EmptyState
        icon="🔐"
        title="유출 의심 패턴이 발견되지 않았습니다."
        description="패턴 기반 스캔이라 100% 보장은 아닙니다."
      />
    )

  const max = secrets[0]?.count || 1
  // Sessions containing the selected type, with that type's per-session count.
  const sessions = selected
    ? secretHits
        .map((h) => ({ hit: h, count: h.types.find((t) => t.key === selected)?.count ?? 0 }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count)
    : []

  const selectType = (key: string) => {
    setSelected((prev) => (prev === key ? null : key))
    setOpenId(null)
  }
  const toggleOpen = (id: string) => setOpenId((prev) => (prev === id ? null : id))

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1">
          🔐 시크릿 · PII 스캔 <Badge tone="danger">추정</Badge>
        </span>
      }
      description={`패턴 매칭 기반 추정 — 오탐 포함 가능 · ${secretSessions}개 세션에서 의심 패턴 발견. 유형을 클릭하면 해당 세션 목록을, 세션을 클릭하면 상세 정보를 볼 수 있습니다.`}
      actions={
        <InfoDot label="세션 로그 텍스트에서 API 키·토큰·개인키·JWT 등 고신호 크리덴셜을 정규식으로 탐지합니다. 예시·무해한 문자열도 매칭될 수 있습니다(오탐). Claude 세션만 대상. 세션 목록은 의심 매치가 많은 상위 세션 위주로 표시됩니다." />
      }
    >
      <div>
        <h3 className="mb-2 text-xs font-medium text-fg-muted">
          유형별 의심 매치 수<span className="text-fg-subtle"> · {total.toLocaleString()} · 클릭하면 세션 목록</span>
        </h3>
        <div className="space-y-1.5">
          {secrets.map((c) => {
            const active = selected === c.key
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => selectType(c.key)}
                aria-pressed={active}
                title={`${c.key} · ${c.count.toLocaleString()}건`}
                className={`group flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-surface-2 ${
                  active ? 'bg-brand/10' : ''
                }`}
              >
                <span
                  className={`w-40 shrink-0 truncate font-mono ${active ? 'text-brand' : 'text-fg-muted'}`}
                >
                  {c.key}
                </span>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
                  <div
                    className={`h-full rounded ${active ? 'bg-brand' : 'bg-red-500'}`}
                    style={{ width: `${Math.max((c.count / max) * 100, 2)}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums text-fg-subtle">
                  {c.count.toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {selected && (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <span className="font-mono text-fg">{selected}</span>
            <span className="text-fg-subtle">· 의심 세션 {sessions.length.toLocaleString()}개 · 클릭하면 상세</span>
          </h3>
          {sessions.length === 0 ? (
            <p className="text-2xs text-fg-subtle">
              해당 유형의 세션을 표시 범위(상위 세션)에서 찾지 못했습니다.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {sessions.map(({ hit, count }) => {
                const open = openId === hit.id
                return (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => toggleOpen(hit.id)}
                      aria-expanded={open}
                      title={hit.project}
                      className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs transition-colors hover:bg-surface-2 ${
                        open ? 'bg-brand/10' : ''
                      }`}
                    >
                      <span className={`shrink-0 text-fg-faint transition-transform ${open ? 'rotate-90' : ''}`}>
                        ›
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-fg-muted">
                        {hit.project ? shortPath(hit.project) : '(알 수 없는 프로젝트)'}
                      </span>
                      <span className="shrink-0 tabular-nums text-fg-subtle">{hit.date || '—'}</span>
                      <Badge tone="danger">{count.toLocaleString()}건</Badge>
                    </button>
                    {open && <SessionDetail hit={hit} selected={selected} onOpenSession={onOpenSession} />}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Section>
  )
}
