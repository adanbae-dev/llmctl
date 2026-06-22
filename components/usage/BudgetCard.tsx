'use client'

import { useEffect, useState } from 'react'
import { Section, InfoDot } from '@/components/ui'
import { usd } from './shared'

const KEY = 'llmctl.monthlyBudgetUSD'

// Monthly budget + month-end forecast. The budget is stored locally (this is a
// local-only app); MTD comes from the server's UNSCOPED monthlyCost so it's
// independent of the dashboard's date/project filter.
export function BudgetCard({ monthlyCost }: { monthlyCost: { month: string; cost: number }[] }) {
  const [budget, setBudget] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null
    const n = v ? Number(v) : NaN
    if (Number.isFinite(n) && n > 0) {
      setBudget(n)
      setDraft(String(n))
    } else {
      setEditing(true)
    }
  }, [])

  const save = () => {
    const n = Number(draft)
    if (Number.isFinite(n) && n > 0) {
      window.localStorage.setItem(KEY, String(n))
      setBudget(n)
      setEditing(false)
    } else {
      window.localStorage.removeItem(KEY)
      setBudget(null)
      setEditing(true)
    }
  }

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevYm = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`
  const mtd = monthlyCost.find((m) => m.month === ym)?.cost ?? 0
  const lastMonth = monthlyCost.find((m) => m.month === prevYm)?.cost ?? 0
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const burn = dayOfMonth > 0 ? mtd / dayOfMonth : 0
  const forecast = burn * daysInMonth

  const tone = !budget ? 'none' : forecast > budget ? 'over' : forecast > budget * 0.8 ? 'near' : 'under'
  const barColor = tone === 'over' ? 'bg-red-500' : tone === 'near' ? 'bg-amber-500' : 'bg-emerald-500'
  const textColor = tone === 'over' ? 'text-red-400' : tone === 'near' ? 'text-amber-400' : 'text-emerald-400'
  const pct = budget ? Math.min((forecast / budget) * 100, 100) : 0
  const mtdPct = budget ? Math.min((mtd / budget) * 100, 100) : 0

  const Metric = ({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) => (
    <div className="min-w-0">
      <div className="text-2xs text-fg-faint">{label}</div>
      <div className={`tabular-nums text-sm font-medium ${color ?? 'text-fg-strong'}`}>{value}</div>
      {hint && <div className="text-2xs text-fg-subtle">{hint}</div>}
    </div>
  )

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1">
          💰 이번 달 예산 · 예측 <span className="font-mono text-2xs text-fg-faint">{ym}</span>
        </span>
      }
      description="월 예산은 이 브라우저에만 저장됩니다. 이번 달 지출·예측은 필터와 무관한 전체 데이터 기준입니다."
      actions={
        <InfoDot label="이번 달 지출(MTD)을 경과 일수로 나눠 일평균(번레이트)을 구하고, 그 비율로 월말 예상 지출을 추정합니다. 예측이 예산의 80%를 넘으면 주의(노랑), 100%를 넘으면 초과(빨강)로 표시합니다. 비용은 모두 추정치입니다." />
      }
    >
      {editing || !budget ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-fg-muted">
            월 예산 (USD)
            <div className="mt-1 flex items-center gap-1">
              <span className="text-fg-subtle">$</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="10"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder="예: 500"
                className="w-28 rounded border border-border bg-surface px-2 py-1 text-xs text-fg-strong focus:border-brand/50 focus:outline-none"
              />
            </div>
          </label>
          <button
            type="button"
            onClick={save}
            className="rounded border border-brand/40 bg-brand/10 px-3 py-1 text-xs text-brand transition-colors hover:bg-brand/20"
          >
            저장
          </button>
          {budget && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded border border-border px-3 py-1 text-xs text-fg-subtle transition-colors hover:bg-surface-2"
            >
              취소
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="이번 달 지출" value={usd(mtd)} hint={`${dayOfMonth}/${daysInMonth}일 경과`} />
            <Metric label="일평균(번레이트)" value={usd(burn)} hint="경과일 기준" />
            <Metric label="월말 예상" value={usd(forecast)} hint={`예산 ${usd(budget)}`} color={textColor} />
            <Metric
              label="예산 대비"
              value={`${budget ? Math.round((forecast / budget) * 100) : 0}%`}
              hint={forecast > budget ? `초과 ${usd(forecast - budget)}` : `여유 ${usd(budget - forecast)}`}
              color={textColor}
            />
          </div>

          <div>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-neutral-800/50">
              {/* MTD (solid) + forecast (translucent extension) */}
              <div className={`absolute inset-y-0 left-0 ${barColor} opacity-40`} style={{ width: `${pct}%` }} />
              <div className={`absolute inset-y-0 left-0 ${barColor}`} style={{ width: `${mtdPct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-2xs text-fg-faint">
              <span>지출 {usd(mtd)}</span>
              <span>예상 {usd(forecast)}</span>
              <span>예산 {usd(budget)}</span>
            </div>
          </div>

          {tone === 'over' && (
            <p className="text-2xs text-red-400">⚠ 현재 속도면 월말 예상 지출이 예산을 초과합니다.</p>
          )}
          {tone === 'near' && <p className="text-2xs text-amber-400">월말 예상 지출이 예산의 80%를 넘습니다.</p>}

          <div className="flex items-center gap-3 text-2xs text-fg-subtle">
            {lastMonth > 0 && <span>지난달 {usd(lastMonth)}</span>}
            <button
              type="button"
              onClick={() => {
                setDraft(String(budget))
                setEditing(true)
              }}
              className="text-fg-faint underline-offset-2 hover:text-fg-muted hover:underline"
            >
              예산 변경
            </button>
          </div>
        </div>
      )}
    </Section>
  )
}
