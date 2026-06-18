import { Section, BarList, EmptyState } from '@/components/ui'
import { usd, fmtBytes, shortPath, type SessionStat } from './shared'

export function SessionsSection({ sessions }: { sessions: SessionStat[] }) {
  if (sessions.length === 0)
    return (
      <EmptyState
        title="세션 인사이트가 없습니다"
        description="이 제공자는 세션 단위 비용/용량 데이터를 제공하지 않습니다."
      />
    )
  return (
    <Section title="🗂 세션 Top-N (정리 후보)" description="전체 기간 · 세션 = 파일 1개 · 삭제는 💬 세션 탭에서">
      <div className="grid gap-6 md:grid-cols-2">
        <BarList
          title="가장 비싼 세션 (추정 USD)"
          items={[...sessions]
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 15)
            .map((s) => ({ label: `${shortPath(s.project)} · ${s.date}`, title: s.project, value: s.cost }))}
          color="bg-amber-500"
          fmtValue={usd}
        />
        <BarList
          title="가장 큰 세션 (용량)"
          items={[...sessions]
            .sort((a, b) => b.sizeBytes - a.sizeBytes)
            .slice(0, 15)
            .map((s) => ({ label: `${shortPath(s.project)} · ${s.date}`, title: s.project, value: s.sizeBytes }))}
          color="bg-rose-500"
          fmtValue={fmtBytes}
        />
      </div>
    </Section>
  )
}
