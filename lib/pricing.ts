// Pricing per million tokens. Claude rates are verified (Claude API reference).
// Non-Claude (GPT/Gemini) rates are APPROXIMATE public estimates — edit freely.
// Cache read ≈ 0.1× input; cache write (5-min TTL) ≈ 1.25× input.
export interface Rates {
  input: number
  output: number
  approx?: boolean
}

export function ratesFor(model: string): Rates {
  const m = (model || '').toLowerCase()
  // Claude — verified
  if (m.includes('fable') || m.includes('mythos')) return { input: 10, output: 50 }
  if (m.includes('opus')) return { input: 5, output: 25 }
  if (m.includes('sonnet')) return { input: 3, output: 15 }
  if (m.includes('haiku')) return { input: 1, output: 5 }
  // Non-Claude — APPROXIMATE (not verified); adjust to your plan
  if (m.includes('gpt') || m.includes('codex') || m.startsWith('o3') || m.startsWith('o4'))
    return { input: 1.25, output: 10, approx: true }
  if (m.includes('gemini')) return { input: 1.25, output: 10, approx: true }
  // Unknown (e.g. Cursor with unrecorded model) → Opus-tier guess
  return { input: 5, output: 25, approx: true }
}

export function isApprox(model: string): boolean {
  return ratesFor(model).approx === true
}

export function estimateCostUSD(
  model: string,
  u: { input: number; output: number; cacheRead: number; cacheCreate: number },
): number {
  const r = ratesFor(model)
  const cacheRead = r.input * 0.1
  const cacheWrite = r.input * 1.25 // 5-minute TTL
  return (
    (u.input * r.input +
      u.output * r.output +
      u.cacheRead * cacheRead +
      u.cacheCreate * cacheWrite) /
    1_000_000
  )
}
