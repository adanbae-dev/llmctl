import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { Dispatch, SetStateAction } from 'react'
import { Section, Pill } from '@/components/ui'
import { fmt, ActivityHeatmap, CalendarHeatmap, type DayPoint, type SeriesState } from './shared'

export function ActivitySection({
  perDay,
  series,
  setSeries,
  hasActivity,
  activity,
  activityByDate,
  heatmapView,
  setHeatmapView,
  provider,
  activityRange,
}: {
  perDay: DayPoint[]
  series: SeriesState
  setSeries: Dispatch<SetStateAction<SeriesState>>
  hasActivity: boolean
  activity: number[][]
  activityByDate: { date: string; count: number }[]
  heatmapView: 'dow' | 'date'
  setHeatmapView: Dispatch<SetStateAction<'dow' | 'date'>>
  provider: 'claude' | 'cursor' | 'codex'
  activityRange: string
}) {
  return (
    <div className="space-y-6">
      <Section
        title="일자별 토큰"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: 'output', label: '출력' },
                { key: 'input', label: '입력' },
                { key: 'cacheRead', label: '캐시read' },
              ] as const
            ).map((s) => (
              <Pill key={s.key} active={series[s.key]} onClick={() => setSeries((p) => ({ ...p, [s.key]: !p[s.key] }))}>
                {s.label}
              </Pill>
            ))}
          </div>
        }
      >
        <p className="mb-3 text-2xs text-fg-faint">캐시 read는 출력·입력보다 보통 10~100배 커서 기본 비표시</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={perDay} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#888' }}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <Tooltip
                contentStyle={{ background: '#171717', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => fmt(Number(v) || 0)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series.output && <Bar dataKey="output" name="출력" stackId="a" fill="#34d399" />}
              {series.input && <Bar dataKey="input" name="입력" stackId="a" fill="#60a5fa" />}
              {series.cacheRead && <Bar dataKey="cacheRead" name="캐시read" stackId="a" fill="#a78bfa" />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {hasActivity && (
        <Section
          title="🕒 활동 히트맵"
          description={`${
            provider === 'claude' ? '응답 메시지 기준' : provider === 'codex' ? '세션 시작 기준' : '메시지 기준'
          } · 로컬 시간 · ${activityRange}`}
          actions={
            <div className="flex items-center gap-1">
              {(
                [
                  ['dow', '요일 × 시간'],
                  ['date', '날짜별'],
                ] as const
              ).map(([v, label]) => (
                <Pill key={v} active={heatmapView === v} onClick={() => setHeatmapView(v)}>
                  {label}
                </Pill>
              ))}
            </div>
          }
        >
          {heatmapView === 'dow' ? <ActivityHeatmap data={activity} /> : <CalendarHeatmap data={activityByDate} />}
        </Section>
      )}
    </div>
  )
}
