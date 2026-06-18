import { Stat, InfoDot, Badge } from '@/components/ui'
import { GLOSSARY } from '@/lib/glossary'
import { fmt, type Totals, type ActivityStats } from './shared'

export function UsageOverview({
  totals,
  totalCost,
  hasApprox,
  efficiency,
  truncation,
  activityStats,
  busiestDow,
  sessionsCount,
}: {
  totals: Totals
  totalCost: number
  hasApprox: boolean
  efficiency: { saved: number; outIn: number }
  truncation: { total: number; rate: number }
  activityStats: ActivityStats | null
  busiestDow: string | null
  sessionsCount: number
}) {
  const cacheHitRate = (
    (totals.cacheRead / Math.max(totals.input + totals.cacheRead + totals.cacheCreate, 1)) * 100
  ).toFixed(0)
  const narrative = `이 기간 ${hasApprox ? '≈ ' : ''}$${totalCost.toFixed(2)} · 출력 ${fmt(totals.output)} 토큰${
    busiestDow ? ` · 최다 활동 ${busiestDow}요일` : ''
  }${sessionsCount ? ` · 주목 세션 ${sessionsCount}개 (세션 탭)` : ''}`
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1.3fr_2.7fr]">
        <Stat
          size="lg"
          tone="cost"
          label={
            <>
              추정 비용 (USD)
              <InfoDot label={hasApprox ? `${GLOSSARY.cost} ${GLOSSARY.costApprox}` : GLOSSARY.cost} />
              <Badge tone="cost">추정</Badge>
            </>
          }
          value={`${hasApprox ? '≈ ' : ''}$${totalCost.toFixed(2)}`}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat tone="output" label="출력 토큰 (생성)" value={fmt(totals.output)} hint={<InfoDot label={GLOSSARY.output} />} />
          <Stat label="입력 토큰" value={fmt(totals.input)} hint={<InfoDot label={GLOSSARY.input} />} />
          <Stat label="캐시 read" value={fmt(totals.cacheRead)} hint={<InfoDot label={GLOSSARY.cacheRead} />} />
          <Stat tone="cache" label="캐시 적중률" value={`${cacheHitRate}%`} hint={<InfoDot label={GLOSSARY.cacheHit} />} />
          <Stat label="메시지 수" value={fmt(totals.messages)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          tone="output"
          label="캐시 절약 (추정)"
          value={`≈ $${efficiency.saved.toFixed(2)}`}
          hint={<InfoDot label={GLOSSARY.cacheSaved} />}
        />
        <Stat label="출력/입력 비율" value={efficiency.outIn.toFixed(3)} hint={<InfoDot label={GLOSSARY.outInRatio} />} />
        {truncation.total > 0 && (
          <Stat
            tone={truncation.rate > 5 ? 'danger' : 'default'}
            label="잘림율 (max_tokens·전체)"
            value={`${truncation.rate.toFixed(1)}%`}
            hint={<InfoDot label={GLOSSARY.truncation} />}
          />
        )}
        {activityStats && (
          <Stat tone="cache" label="최장 연속·활동일" value={`${activityStats.longest}·${activityStats.activeDays}일`} />
        )}
        {activityStats && <Stat label="가장 바쁜 날" value={activityStats.busiest.date} />}
      </div>

      <p className="text-2xs leading-relaxed text-fg-subtle">
        {narrative}. 비용은 추정치이며 ‘≈’는 단가 미검증을 뜻합니다.
      </p>
    </div>
  )
}
