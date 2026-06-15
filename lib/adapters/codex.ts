import path from 'node:path'
import { promises as fs } from 'node:fs'
import { CODEX_SESSIONS, encodeId } from '../paths'
import { readLinesFromOffset, readHeadWindow, readTailWindow } from './jsonl'
import type {
  ProviderAdapter,
  Session,
  SessionSummary,
  Message,
  Role,
  TailResult,
} from './types'

// Above this size we window the file (head + tail) instead of reading it whole.
// Codex rollout files are known to reach hundreds of MB / GB from compaction.
const SIZE_CAP = 50 * 1024 * 1024
const TAIL_WINDOW = 4 * 1024 * 1024

function safeParse(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function mapRole(r: unknown): Role {
  if (r === 'assistant') return 'assistant'
  if (r === 'user') return 'user'
  if (r === 'tool') return 'tool'
  return 'system' // developer / system / unknown
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        typeof c === 'string' ? c : String((c as Record<string, unknown>)?.text ?? ''),
      )
      .filter(Boolean)
      .join('')
  }
  return ''
}

// Newer Codex: Responses-API items carry the canonical transcript.
function fromResponseItem(d: Record<string, unknown>, idx: number): Message[] {
  const p = d.payload as Record<string, unknown> | undefined
  if (d.type !== 'response_item' || !p) return []
  const ts = d.timestamp as string | undefined
  switch (p.type) {
    case 'message': {
      const text = textFromContent(p.content)
      if (!text.trim()) return []
      return [{ id: `ri-${idx}`, role: mapRole(p.role), ts, blocks: [{ kind: 'text', text }] }]
    }
    case 'reasoning': {
      const text = textFromContent(p.summary ?? p.content)
      if (!text.trim()) return []
      return [{ id: `re-${idx}`, role: 'assistant', ts, blocks: [{ kind: 'thinking', text }] }]
    }
    case 'function_call': {
      let input: unknown = p.arguments
      try {
        input = typeof p.arguments === 'string' ? JSON.parse(p.arguments) : p.arguments
      } catch {
        // leave raw string
      }
      return [
        {
          id: `fc-${idx}`,
          role: 'assistant',
          ts,
          blocks: [
            { kind: 'tool_use', id: String(p.call_id ?? ''), name: String(p.name ?? 'tool'), input },
          ],
        },
      ]
    }
    case 'function_call_output':
    case 'local_shell_call_output': {
      const o = p.output as Record<string, unknown> | string | undefined
      const output =
        typeof o === 'string'
          ? o
          : o && typeof o === 'object'
            ? textFromContent(o.content) || JSON.stringify(o)
            : ''
      return [
        {
          id: `fo-${idx}`,
          role: 'tool',
          ts,
          blocks: [{ kind: 'tool_result', toolUseId: String(p.call_id ?? ''), output }],
        },
      ]
    }
    default:
      return []
  }
}

// Older Codex: human-facing turns live in event_msg events.
function fromEventMsg(d: Record<string, unknown>, idx: number): Message[] {
  const p = d.payload as Record<string, unknown> | undefined
  if (d.type !== 'event_msg' || !p) return []
  const ts = d.timestamp as string | undefined
  if (p.type === 'user_message' && p.message)
    return [{ id: `um-${idx}`, role: 'user', ts, blocks: [{ kind: 'text', text: String(p.message) }] }]
  if (p.type === 'agent_message' && p.message)
    return [{ id: `am-${idx}`, role: 'assistant', ts, blocks: [{ kind: 'text', text: String(p.message) }] }]
  if (p.type === 'agent_reasoning' && p.text)
    return [{ id: `ar-${idx}`, role: 'assistant', ts, blocks: [{ kind: 'thinking', text: String(p.text) }] }]
  return []
}

function parseLines(lines: string[]): Message[] {
  const primary: Message[] = []
  const fallback: Message[] = []
  let i = 0
  for (const line of lines) {
    const d = safeParse(line)
    if (!d) continue
    const ri = fromResponseItem(d, i)
    if (ri.length) primary.push(...ri)
    else fallback.push(...fromEventMsg(d, i))
    i++
  }
  // Prefer the structured response_item transcript; fall back to event stream.
  return primary.length ? primary : fallback
}

// Codex logs cumulative token usage in event_msg/token_count events. We take the
// last one seen (cumulative total). Defensive: shapes vary across versions.
function extractUsage(lines: string[]): { inputTokens: number; outputTokens: number } | undefined {
  let last: Record<string, unknown> | null = null
  for (const line of lines) {
    const d = safeParse(line)
    const p = d?.payload as Record<string, unknown> | undefined
    if (d?.type === 'event_msg' && p?.type === 'token_count') {
      const info = (p.info ?? p) as Record<string, unknown>
      const tot = (info.total_token_usage ?? info.totalTokenUsage) as
        | Record<string, unknown>
        | undefined
      if (tot) last = tot
    }
  }
  if (!last) return undefined
  const inp = Number(last.input_tokens ?? last.inputTokens ?? 0)
  const out = Number(last.output_tokens ?? last.outputTokens ?? 0)
  if (!inp && !out) return undefined
  return { inputTokens: inp, outputTokens: out }
}

async function summarize(filePath: string): Promise<SessionSummary> {
  const stat = await fs.stat(filePath)
  const head = await readHeadWindow(filePath, 128 * 1024)
  let cwd = ''
  let startedAt: string | undefined
  let model: string | undefined
  let firstUser = ''
  for (const line of head) {
    const d = safeParse(line)
    if (!d) continue
    if (d.type === 'session_meta' && d.payload) {
      const p = d.payload as Record<string, unknown>
      cwd = String(p.cwd ?? cwd)
      startedAt = (p.timestamp as string) ?? (d.timestamp as string) ?? startedAt
      model = (p.model as string) ?? model
    }
    if (d.type === 'turn_context' && !model) {
      const p = d.payload as Record<string, unknown> | undefined
      if (p?.model) model = String(p.model)
    }
    if (!firstUser) {
      const u = [...fromResponseItem(d, 0), ...fromEventMsg(d, 0)].find((m) => m.role === 'user')
      const tb = u?.blocks.find((b) => b.kind === 'text')
      if (tb && tb.kind === 'text') firstUser = tb.text.trim()
    }
  }
  return {
    id: encodeId(filePath),
    provider: 'codex',
    title: (firstUser || path.basename(cwd || filePath)).slice(0, 120),
    projectPath: cwd || '(unknown)',
    filePath,
    startedAt,
    updatedAt: stat.mtime.toISOString(),
    sizeBytes: stat.size,
    model: model ?? 'gpt (codex)',
  }
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const fp = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(fp)))
    else if (e.isFile() && e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) out.push(fp)
  }
  return out
}

const tail: ProviderAdapter['tail'] = async (filePath, fromOffset) => {
  const { lines, nextOffset } = await readLinesFromOffset(filePath, fromOffset)
  return { messages: parseLines(lines), nextOffset }
}

const parse: ProviderAdapter['parse'] = async (filePath) => {
  const base = await summarize(filePath)
  const stat = await fs.stat(filePath)
  let messages: Message[]
  let usageLines: string[]
  let truncated = false
  if (stat.size <= SIZE_CAP) {
    const { lines } = await readLinesFromOffset(filePath, 0)
    messages = parseLines(lines)
    usageLines = lines
  } else {
    truncated = true
    const headLines = await readHeadWindow(filePath, 256 * 1024)
    const { lines: tailLines } = await readTailWindow(filePath, TAIL_WINDOW)
    const headMsgs = parseLines(headLines)
      .filter((m) => m.role === 'user')
      .slice(0, 1)
    messages = [...headMsgs, ...parseLines(tailLines)]
    usageLines = tailLines // token_count is cumulative; latest is near the end
  }
  return {
    ...base,
    messages,
    messageCount: messages.length,
    truncated,
    totalUsage: extractUsage(usageLines),
  }
}

const discover: ProviderAdapter['discover'] = async () => {
  const out: SessionSummary[] = []
  const files = await walk(CODEX_SESSIONS)
  for (const fp of files) {
    try {
      out.push(await summarize(fp))
    } catch {
      // Skip unreadable files.
    }
  }
  return out
}

export const codex: ProviderAdapter = {
  id: 'codex',
  appendable: true,
  discover,
  parse,
  tail,
}
