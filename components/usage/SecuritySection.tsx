'use client'

import { useState } from 'react'
import { Section, EmptyState, Badge, InfoDot } from '@/components/ui'
import { shortPath, type CountRow, type SecretHit } from './shared'

/** Pattern-based secret/PII scan results (Claude). Defensive: helps users find
 *  credentials accidentally left in their own local session logs. Regex-only,
 *  so always framed as an estimate that may include false positives.
 *
 *  Selecting a match type drills down into the suspected sessions behind it. */
export function SecuritySection({
  provider,
  secrets,
  secretSessions,
  secretHits,
}: {
  provider: 'claude' | 'cursor' | 'codex'
  secrets: CountRow[]
  secretSessions: number
  secretHits: SecretHit[]
}) {
  const [selected, setSelected] = useState<string | null>(null)

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

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1">
          🔐 시크릿 · PII 스캔 <Badge tone="danger">추정</Badge>
        </span>
      }
      description={`패턴 매칭 기반 추정 — 오탐 포함 가능 · ${secretSessions}개 세션에서 의심 패턴 발견. 유형을 클릭하면 해당 세션 목록을 확인할 수 있습니다.`}
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
                onClick={() => setSelected(active ? null : c.key)}
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
            <span className="text-fg-subtle">· 의심 세션 {sessions.length.toLocaleString()}개</span>
          </h3>
          {sessions.length === 0 ? (
            <p className="text-2xs text-fg-subtle">
              해당 유형의 세션을 표시 범위(상위 세션)에서 찾지 못했습니다.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {sessions.map(({ hit, count }) => (
                <li key={hit.id} className="flex items-center gap-2 py-1 text-xs">
                  <span className="flex-1 truncate font-mono text-fg-muted" title={hit.project}>
                    {hit.project ? shortPath(hit.project) : '(알 수 없는 프로젝트)'}
                  </span>
                  <span className="shrink-0 tabular-nums text-fg-subtle">{hit.date || '—'}</span>
                  <Badge tone="danger">{count.toLocaleString()}건</Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-2xs text-fg-subtle">
            실제 유출 여부는 💬 세션 탭에서 해당 세션을 직접 확인하세요.
          </p>
        </div>
      )}
    </Section>
  )
}
