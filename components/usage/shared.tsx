// Shared types, formatters and chart primitives for the usage dashboard
// sections. The dashboard shell owns all data; sections are presentational.

export interface UsageRow {
  date: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
  messages: number
}

export interface ToolRow {
  date: string
  tool: string
  count: number
}

export interface GroupRow {
  key: string
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
  messages: number
  cost: number
}

export interface CountRow {
  key: string
  count: number
}

export interface ToolErrorRow {
  tool: string
  total: number
  errors: number
}

export interface SessionStat {
  id: string
  project: string
  date: string
  cost: number
  sizeBytes: number
}

export interface Insights {
  byProject: GroupRow[]
  byBranch: GroupRow[]
  stopReasons: CountRow[]
  skills: CountRow[]
  subagents: CountRow[]
  hotFiles: CountRow[]
  toolErrors: ToolErrorRow[]
  activity: number[][]
  activityByDate: { date: string; count: number }[]
  sessions: SessionStat[]
}

export type Totals = { input: number; output: number; cacheRead: number; cacheCreate: number; messages: number }
export type PerModel = {
  model: string
  output: number
  input: number
  cacheRead: number
  cacheCreate: number
  messages: number
  cost: number
  approx: boolean
}
export type CostPoint = { date: string; cost: number; cumulative: number; avg7: number }
export type DayPoint = { date: string; output: number; input: number; cacheRead: number }
export type ToolGroups = {
  builtin: { tool: string; count: number }[]
  builtinTotal: number
  builtinMax: number
  mcpTotal: number
  mcpMax: number
  servers: { server: string; tools: { name: string; count: number }[]; total: number }[]
}
export type SeriesState = { output: boolean; input: boolean; cacheRead: boolean }
export type ActivityStats = {
  activeDays: number
  longest: number
  busiest: { date: string; count: number }
  avg: number
}

export const fmt = (n: number) => n.toLocaleString()
export const usd = (n: number) => `$${n.toFixed(2)}`
export const DOW = ['일', '월', '화', '수', '목', '금', '토']
export const MODEL_COLORS = ['#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f472b6', '#22d3ee', '#fb923c', '#a3e635']

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

// Category color for a tool name (built-in heuristics + MCP).
export function toolColor(tool: string): string {
  const t = tool.toLowerCase()
  if (t.startsWith('mcp__')) return 'bg-fuchsia-500'
  if (/(^|[_-])(bash|shell|exec|terminal)/.test(t)) return 'bg-red-500'
  if (/(write|edit|apply_patch|create|notebookedit|multiedit)/.test(t)) return 'bg-amber-500'
  if (/(read|grep|glob|search|webfetch|websearch|fetch|ls)/.test(t)) return 'bg-blue-500'
  if (/(task|agent|worktree)/.test(t)) return 'bg-emerald-500'
  return 'bg-neutral-500'
}

export function shortPath(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts.length <= 2 ? p : '…/' + parts.slice(-2).join('/')
}

/** Activity heatmap: 7 weekdays × 24 hours, intensity scaled to the busiest cell. */
export function ActivityHeatmap({ data }: { data: number[][] }) {
  if (!data || data.length === 0) return null
  const max = Math.max(1, ...data.flat())
  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex">
          <div className="w-8 shrink-0" />
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="w-[22px] shrink-0 text-center text-[10px] text-neutral-600">
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {data.map((row, dow) => (
          <div key={dow} className="flex items-center">
            <div className="w-8 shrink-0 text-[11px] text-neutral-500">{DOW[dow]}</div>
            {row.map((c, h) => (
              <div
                key={h}
                className="m-[1px] h-[20px] w-[20px] shrink-0 rounded-sm"
                title={`${DOW[dow]}요일 ${h}시 · ${c.toLocaleString()}`}
                style={{
                  backgroundColor:
                    c === 0 ? 'rgba(255,255,255,0.04)' : `rgba(52,211,153,${0.15 + 0.85 * (c / max)})`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Calendar heatmap (GitHub-style): weeks as columns × 7 weekday rows, full date range. */
export function CalendarHeatmap({ data }: { data: { date: string; count: number }[] }) {
  if (!data || data.length === 0) return null
  const max = Math.max(1, ...data.map((d) => d.count))
  const byDate = new Map(data.map((d) => [d.date, d.count]))
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const fmtDate = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  const start = parse(data[0].date)
  const end = parse(data[data.length - 1].date)
  const cur = new Date(start)
  cur.setDate(cur.getDate() - cur.getDay()) // back to Sunday of the first week
  const weeks: { date: string; count: number; inRange: boolean }[][] = []
  while (cur <= end) {
    const week: { date: string; count: number; inRange: boolean }[] = []
    for (let i = 0; i < 7; i++) {
      const ds = fmtDate(cur)
      week.push({ date: ds, count: byDate.get(ds) ?? 0, inRange: cur >= start && cur <= end })
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }
  const monthOf = (w: { date: string; inRange: boolean }[]) => parse((w.find((d) => d.inRange) ?? w[0]).date).getMonth()
  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex pl-8">
          {weeks.map((w, i) => {
            const m = monthOf(w)
            const show = i === 0 || monthOf(weeks[i - 1]) !== m
            return (
              <div key={i} className="w-[15px] shrink-0 text-[9px] text-neutral-500">
                {show ? `${m + 1}월` : ''}
              </div>
            )
          })}
        </div>
        <div className="flex">
          <div className="mr-1 flex flex-col">
            {DOW.map((d, i) => (
              <div key={i} className="h-[15px] w-7 text-[9px] leading-[15px] text-neutral-500">
                {i % 2 === 1 ? d : ''}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col">
              {week.map((d, di) => (
                <div
                  key={di}
                  className="m-[1px] h-[13px] w-[13px] rounded-sm"
                  title={d.inRange ? `${d.date} · ${d.count.toLocaleString()}` : ''}
                  style={{
                    backgroundColor: !d.inRange
                      ? 'transparent'
                      : d.count === 0
                        ? 'rgba(255,255,255,0.04)'
                        : `rgba(52,211,153,${0.15 + 0.85 * (d.count / max)})`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
