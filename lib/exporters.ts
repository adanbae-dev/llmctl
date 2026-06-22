// Client-side exporters: turn an in-memory session or usage rows into a
// downloadable file. Pure string builders + a Blob download helper (the latter
// only runs in the browser, called from event handlers). Read-only — never
// touches the original logs.

import { estimateCostUSD } from './pricing'
import type { Session } from './adapters/types'
import type { UsageRow } from '@/components/usage/shared'

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

const ROLE: Record<string, string> = {
  user: '🙂 User',
  assistant: '🤖 Assistant',
  system: '⚙️ System',
  tool: '🔧 Tool',
}

/** Render a parsed session as readable Markdown (prose, thinking, tool calls). */
export function sessionToMarkdown(s: Session): string {
  const out: string[] = []
  out.push(`# ${s.title || '(제목 없음)'}`, '')
  out.push(`- provider: ${s.provider}`)
  if (s.projectPath) out.push(`- project: ${s.projectPath}`)
  const models = s.modelsUsed?.length ? s.modelsUsed : s.model ? [s.model] : []
  if (models.length) out.push(`- models: ${models.join(', ')}`)
  if (s.startedAt || s.updatedAt)
    out.push(`- date: ${(s.startedAt ?? '').slice(0, 10)} → ${(s.updatedAt ?? '').slice(0, 10)}`)
  if (s.totalUsage)
    out.push(`- tokens: in ${s.totalUsage.inputTokens ?? 0} / out ${s.totalUsage.outputTokens ?? 0}`)
  out.push('', '---', '')

  for (const m of s.messages) {
    out.push(`## ${ROLE[m.role] ?? m.role}${m.model ? ` · \`${m.model}\`` : ''}`, '')
    for (const b of m.blocks) {
      if (b.kind === 'text') out.push(b.text, '')
      else if (b.kind === 'thinking') out.push('> 💭 ' + b.text.replace(/\n/g, '\n> '), '')
      else if (b.kind === 'tool_use') out.push('```json', `// 🔧 ${b.name}`, safeJson(b.input), '```', '')
      else if (b.kind === 'tool_result')
        out.push('```', `// ↳ result${b.isError ? ' (error)' : ''}`, b.output, '```', '')
    }
    out.push('---', '')
  }
  return out.join('\n')
}

/** Pretty-printed raw session JSON. */
export function sessionToJson(s: Session): string {
  return safeJson(s)
}

const csvEsc = (v: string | number): string => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Usage rows → CSV (date, model, token columns, estimated cost). */
export function rowsToCsv(rows: UsageRow[]): string {
  const head = ['date', 'model', 'input', 'output', 'cacheRead', 'cacheCreate', 'messages', 'costUSD']
  const lines = [head.join(',')]
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model))
  for (const r of sorted) {
    const cost = estimateCostUSD(r.model, r)
    lines.push(
      [r.date, r.model, r.input, r.output, r.cacheRead, r.cacheCreate, r.messages, cost.toFixed(4)]
        .map(csvEsc)
        .join(','),
    )
  }
  return lines.join('\n')
}

/** Filesystem-safe-ish filename fragment (keeps Hangul, ASCII word chars). */
export function safeName(s: string): string {
  return (s || 'untitled').replace(/[^\w.\-가-힣]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'untitled'
}

/** Trigger a browser download of text content. */
export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
