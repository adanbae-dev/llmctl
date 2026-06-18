import { Section, BarList, EmptyState, Badge, InfoDot } from '@/components/ui'
import type { CountRow } from './shared'

/** Pattern-based secret/PII scan results (Claude). Defensive: helps users find
 *  credentials accidentally left in their own local session logs. Regex-only,
 *  so always framed as an estimate that may include false positives. */
export function SecuritySection({
  provider,
  secrets,
  secretSessions,
}: {
  provider: 'claude' | 'cursor' | 'codex'
  secrets: CountRow[]
  secretSessions: number
}) {
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
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1">
          🔐 시크릿 · PII 스캔 <Badge tone="danger">추정</Badge>
        </span>
      }
      description={`패턴 매칭 기반 추정 — 오탐 포함 가능 · ${secretSessions}개 세션에서 의심 패턴 발견. 실제 유출 여부는 해당 세션을 직접 확인하세요.`}
      actions={
        <InfoDot label="세션 로그 텍스트에서 API 키·토큰·개인키·JWT 등 고신호 크리덴셜을 정규식으로 탐지합니다. 예시·무해한 문자열도 매칭될 수 있습니다(오탐). Claude 세션만 대상." />
      }
    >
      <BarList
        title="유형별 의심 매치 수"
        total={total}
        items={secrets.map((c) => ({ label: c.key, value: c.count }))}
        color="bg-red-500"
      />
    </Section>
  )
}
