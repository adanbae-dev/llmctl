// Pure metrics helpers for the live usage viewer. No React and no I/O, so the
// rate math can be reasoned about (and unit-tested) in isolation. All token
// fields are CUMULATIVE since the viewer opened; rates are derived by diffing
// the ends of a sliding time window.

export interface RateSample {
  t: number // epoch ms
  out: number // cumulative output tokens at t
  cost?: number // cumulative est USD at t (aggregate samples carry this)
}

export const RATE_WINDOW_MS = 60_000
const MAX_SAMPLES = 240 // backstop so a long-open viewer can't grow unbounded
const MIN_SPAN_MS = 3_000 // need at least this much elapsed for a meaningful rate

/** Append a sample, dropping anything older than windowMs (and capping length). */
export function pushSample(
  buf: RateSample[],
  s: RateSample,
  windowMs: number = RATE_WINDOW_MS,
): RateSample[] {
  const cutoff = s.t - windowMs
  const next = buf.filter((x) => x.t >= cutoff)
  next.push(s)
  return next.length > MAX_SAMPLES ? next.slice(-MAX_SAMPLES) : next
}

export interface Burn {
  tokPerMin: number
  usdPerHour: number
  ok: boolean // false until the window spans enough time to be meaningful
}

export function burnRate(buf: RateSample[]): Burn {
  if (buf.length < 2) return { tokPerMin: 0, usdPerHour: 0, ok: false }
  const first = buf[0]
  const last = buf[buf.length - 1]
  const dt = last.t - first.t
  if (dt < MIN_SPAN_MS) return { tokPerMin: 0, usdPerHour: 0, ok: false }
  const tokPerMin = ((last.out - first.out) / dt) * 60_000
  const usdPerHour =
    first.cost != null && last.cost != null ? ((last.cost - first.cost) / dt) * 3_600_000 : 0
  return { tokPerMin: Math.max(0, tokPerMin), usdPerHour: Math.max(0, usdPerHour), ok: true }
}

/** Per-interval output deltas (throughput) for a sparkline. */
export function throughputSeries(buf: RateSample[]): number[] {
  const out: number[] = []
  for (let i = 1; i < buf.length; i++) out.push(Math.max(0, buf[i].out - buf[i - 1].out))
  return out
}

/** Top-N tool names by call count, descending, zero counts dropped. */
export function topTools(
  counts: Record<string, number>,
  n: number = 6,
): { label: string; value: number }[] {
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, value]) => ({ label, value }))
}

export type SessionState = 'generating' | 'idle'

/** A session is "generating" if it appended output within the last activeMs. */
export function sessionState(
  lastUpdate: number,
  now: number,
  activeMs: number = 6_000,
): SessionState {
  return lastUpdate > 0 && now - lastUpdate <= activeMs ? 'generating' : 'idle'
}
