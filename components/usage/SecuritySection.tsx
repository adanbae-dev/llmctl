'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Section, EmptyState, Badge, InfoDot, Skeleton } from '@/components/ui'
import { fmt, fmtBytes, shortPath, type SecretHit, type SecretTypeStat, type Severity } from './shared'
import type { Session } from '@/lib/adapters/types'

const day = (iso?: string) => (iso ? iso.slice(0, 10) : '—')

type Filter = 'all' | 'exposed' | 'mention'

// Severity presentation: red = real exposure, amber = mere mention/example.
const SEV: Record<Severity, { short: string; dot: string; text: string; chip: string }> = {
  exposed: { short: '노출', dot: '🔴', text: 'text-red-400', chip: 'border-red-500/50 bg-red-500/10 text-red-400' },
  mention: { short: '언급', dot: '🟡', text: 'text-amber-400', chip: 'border-amber-500/50 bg-amber-500/10 text-amber-400' },
}

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
 *  per-(type×severity) match breakdown, without leaving the Security tab.
 *  Each breakdown pill jumps to that match's message in the 💬 세션 view. */
function SessionDetail({
  hit,
  selected,
  filter,
  onOpenSession,
}: {
  hit: SecretHit
  selected: string
  filter: Filter
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

  // Which severities to surface depends on the active filter.
  const sevs: Severity[] = filter === 'exposed' ? ['exposed'] : filter === 'mention' ? ['mention'] : ['exposed', 'mention']
  const pills = hit.types.flatMap((t) => sevs.filter((s) => t[s] > 0).map((s) => ({ type: t.key, sev: s, count: t[s] })))
  const anchorFor = (type: string, sev: Severity) =>
    hit.matches.find((m) => m.type === type && m.severity === sev)?.messageId
  const primaryAnchor = () => {
    for (const s of sevs) {
      const a = anchorFor(selected, s)
      if (a) return a
    }
    return hit.matches[0]?.messageId
  }

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
              의심 매치 (노출 {fmt(hit.exposedTotal)} · 언급 {fmt(hit.mentionTotal)})
              {onOpenSession && <span className="ml-1">· 등급·유형을 누르면 해당 메시지로 이동</span>}
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {pills.map((p) => {
                const anchor = anchorFor(p.type, p.sev)
                const meta = SEV[p.sev]
                return onOpenSession ? (
                  <button
                    key={`${p.type}|${p.sev}`}
                    type="button"
                    onClick={() => onOpenSession(hit.id, anchor)}
                    title={anchor ? `💬 세션에서 "${p.type}" ${meta.short} 매치로 이동` : '세션 열기 (메시지 위치 불명)'}
                    className={`rounded-full border px-2 py-0.5 transition-opacity hover:opacity-80 ${meta.chip}`}
                  >
                    {meta.dot} {p.type} · {fmt(p.count)} {anchor ? '↗' : ''}
                  </button>
                ) : (
                  <span key={`${p.type}|${p.sev}`} className={`rounded-full border px-2 py-0.5 ${meta.chip}`}>
                    {meta.dot} {p.type} · {fmt(p.count)}
                  </span>
                )
              })}
            </div>
          </div>
          {onOpenSession ? (
            <button
              type="button"
              onClick={() => onOpenSession(hit.id, primaryAnchor())}
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
 *  Matches are graded by severity — 🔴 노출 의심 (looks like a real, complete
 *  credential) vs 🟡 언급·예시 (placeholder / example / masked). A severity
 *  filter, per-type split bars, the session drill-down, and the scroll-to-match
 *  jump all respect the selected grade. */
export function SecuritySection({
  provider,
  secrets,
  secretSeverity,
  secretSessions,
  exposedSessions,
  mentionSessions,
  secretHits,
  onOpenSession,
}: {
  provider: 'claude' | 'cursor' | 'codex'
  secrets: SecretTypeStat[]
  secretSeverity: { exposed: number; mention: number }
  secretSessions: number
  exposedSessions: number
  mentionSessions: number
  secretHits: SecretHit[]
  // Jump to a session's matched message in the 💬 세션 view.
  onOpenSession?: (id: string, anchor?: string) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
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
  const grand = secretSeverity.exposed + secretSeverity.mention
  if (grand === 0)
    return (
      <EmptyState
        icon="🔐"
        title="유출 의심 패턴이 발견되지 않았습니다."
        description="패턴 기반 스캔이라 100% 보장은 아닙니다."
      />
    )

  // Per-type value under the active filter, and the sessions behind a selected type.
  const valOf = (t: SecretTypeStat) =>
    filter === 'exposed' ? t.exposed : filter === 'mention' ? t.mention : t.exposed + t.mention
  const view = secrets
    .map((t) => ({ t, v: valOf(t) }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v)
  const max = view[0]?.v || 1

  const hitVal = (h: SecretHit, typeKey: string) => {
    const ts = h.types.find((t) => t.key === typeKey)
    if (!ts) return 0
    return filter === 'exposed' ? ts.exposed : filter === 'mention' ? ts.mention : ts.exposed + ts.mention
  }
  const sessions = selected
    ? secretHits
        .map((h) => ({ hit: h, count: hitVal(h, selected) }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count)
    : []

  const filters: { key: Filter; title: string; count: number; sessions: number }[] = [
    { key: 'all', title: '전체', count: grand, sessions: secretSessions },
    { key: 'exposed', title: '🔴 노출 의심', count: secretSeverity.exposed, sessions: exposedSessions },
    { key: 'mention', title: '🟡 언급·예시', count: secretSeverity.mention, sessions: mentionSessions },
  ]
  const filterLabel =
    filter === 'all'
      ? `전체 ${fmt(grand)}건`
      : `${SEV[filter].dot} ${SEV[filter].short} ${fmt(filter === 'exposed' ? secretSeverity.exposed : secretSeverity.mention)}건`

  const applyFilter = (f: Filter) => {
    setFilter(f)
    setSelected(null)
    setOpenId(null)
  }
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
      description={`패턴 매칭 기반 추정 — 실제 크리덴셜로 보이는 '🔴 노출 의심'과 예시·플레이스홀더로 보이는 '🟡 단순 언급'을 보안 등급으로 분리했습니다. 오탐 포함 가능 · 총 ${secretSessions}개 세션에서 발견.`}
      actions={
        <InfoDot label="세션 로그에서 API 키·토큰·개인키·JWT 등 고신호 크리덴셜을 정규식으로 탐지합니다. 매치된 토큰이 실제 형태의 완전한 값이면 '노출 의심', 플레이스홀더·예시·마스킹·저엔트로피면 '언급·예시'로 등급을 추정합니다(불확실하면 노출로 분류, 개인키 블록은 항상 노출). Claude 세션만 대상." />
      }
    >
      {/* Severity summary doubling as a filter */}
      <div className="grid grid-cols-3 gap-1.5">
        {filters.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => applyFilter(f.key)}
              aria-pressed={active}
              className={`rounded border px-2 py-1.5 text-left transition-colors ${
                active ? 'border-brand/50 bg-brand/10' : 'border-border hover:bg-surface-2'
              }`}
            >
              <div className={`text-xs font-medium ${active ? 'text-fg-strong' : 'text-fg-muted'}`}>{f.title}</div>
              <div className="text-2xs text-fg-subtle">
                {fmt(f.count)}건 · {fmt(f.sessions)}개 세션
              </div>
            </button>
          )
        })}
      </div>

      {/* Per-type split bars (red = exposed, amber = mention) */}
      <div className="mt-4">
        <h3 className="mb-2 text-xs font-medium text-fg-muted">
          유형별 의심 매치<span className="text-fg-subtle"> · {filterLabel} · 클릭하면 세션 목록</span>
        </h3>
        {view.length === 0 ? (
          <p className="text-2xs text-fg-subtle">해당 등급의 매치가 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {view.map(({ t, v }) => {
              const active = selected === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => selectType(t.key)}
                  aria-pressed={active}
                  title={`${t.key} · 노출 ${fmt(t.exposed)} · 언급 ${fmt(t.mention)}`}
                  className={`group flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-surface-2 ${
                    active ? 'bg-brand/10' : ''
                  }`}
                >
                  <span className={`w-40 shrink-0 truncate font-mono ${active ? 'text-brand' : 'text-fg-muted'}`}>
                    {t.key}
                  </span>
                  <div className="relative flex h-4 flex-1 overflow-hidden rounded bg-neutral-800/40">
                    {filter !== 'mention' && t.exposed > 0 && (
                      <div className="h-full bg-red-500" style={{ width: `${Math.max((t.exposed / max) * 100, 1.5)}%` }} />
                    )}
                    {filter !== 'exposed' && t.mention > 0 && (
                      <div className="h-full bg-amber-500" style={{ width: `${Math.max((t.mention / max) * 100, 1.5)}%` }} />
                    )}
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums text-2xs">
                    {filter === 'all' ? (
                      <>
                        <span className={t.exposed ? 'text-red-400' : 'text-fg-faint'}>{fmt(t.exposed)}</span>
                        <span className="text-fg-faint"> · </span>
                        <span className={t.mention ? 'text-amber-400' : 'text-fg-faint'}>{fmt(t.mention)}</span>
                      </>
                    ) : (
                      <span className={SEV[filter].text}>{fmt(v)}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <span className="font-mono text-fg">{selected}</span>
            <span className="text-fg-subtle">
              {filter !== 'all' && `· ${SEV[filter].dot} ${SEV[filter].short} `}· 의심 세션 {sessions.length.toLocaleString()}개 · 클릭하면 상세
            </span>
          </h3>
          {sessions.length === 0 ? (
            <p className="text-2xs text-fg-subtle">해당 유형·등급의 세션을 표시 범위(상위 세션)에서 찾지 못했습니다.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {sessions.map(({ hit }) => {
                const open = openId === hit.id
                const ts = hit.types.find((t) => t.key === selected)
                const ex = ts?.exposed ?? 0
                const me = ts?.mention ?? 0
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
                      <span className={`shrink-0 text-fg-faint transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-fg-muted">
                        {hit.project ? shortPath(hit.project) : '(알 수 없는 프로젝트)'}
                      </span>
                      <span className="shrink-0 tabular-nums text-fg-subtle">{hit.date || '—'}</span>
                      <span className="flex shrink-0 items-center gap-1 tabular-nums">
                        {filter !== 'mention' && ex > 0 && (
                          <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-2xs font-medium text-red-400">
                            노출 {ex.toLocaleString()}
                          </span>
                        )}
                        {filter !== 'exposed' && me > 0 && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-2xs font-medium text-amber-400">
                            언급 {me.toLocaleString()}
                          </span>
                        )}
                      </span>
                    </button>
                    {open && (
                      <SessionDetail hit={hit} selected={selected} filter={filter} onOpenSession={onOpenSession} />
                    )}
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
