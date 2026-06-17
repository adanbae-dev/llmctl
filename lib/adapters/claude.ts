import path from 'node:path'
import { promises as fs } from 'node:fs'
import { decodeClaudeDir, encodeId } from '../paths'
import { discoverWithArchive } from './archive'
import { readLinesFromOffset, readHeadWindow } from './jsonl'
import type {
  ProviderAdapter,
  Session,
  SessionSummary,
  Message,
  ContentBlock,
  Role,
  TailResult,
} from './types'

// Event lines that are not conversation turns.
const META_TYPES = new Set([
  'custom-title',
  'agent-name',
  'last-prompt',
  'mode',
  'permission-mode',
  'file-history-snapshot',
  'attachment',
  'summary',
])

function safeParse(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

/** Strip system-reminder / command wrappers and tags from a user prompt. */
function cleanPrompt(s: string): string {
  return s
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<command-[a-z-]+>[\s\S]*?<\/command-[a-z-]+>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function mapContent(content: unknown): ContentBlock[] {
  if (typeof content === 'string') {
    return content.trim() ? [{ kind: 'text', text: content }] : []
  }
  if (!Array.isArray(content)) return []
  const blocks: ContentBlock[] = []
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue
    const b = raw as Record<string, unknown>
    switch (b.type) {
      case 'text':
        blocks.push({ kind: 'text', text: String(b.text ?? '') })
        break
      case 'thinking':
        blocks.push({ kind: 'thinking', text: String(b.thinking ?? '') })
        break
      case 'tool_use':
        blocks.push({
          kind: 'tool_use',
          id: String(b.id ?? ''),
          name: String(b.name ?? 'tool'),
          input: b.input,
        })
        break
      case 'tool_result': {
        const c = b.content
        const output =
          typeof c === 'string'
            ? c
            : Array.isArray(c)
              ? c
                  .map((x) =>
                    typeof x === 'string'
                      ? x
                      : ((x as Record<string, unknown>)?.text as string) ??
                        JSON.stringify(x),
                  )
                  .join('\n')
              : JSON.stringify(c ?? '')
        blocks.push({
          kind: 'tool_result',
          toolUseId: String(b.tool_use_id ?? ''),
          output,
          isError: Boolean(b.is_error),
        })
        break
      }
    }
  }
  return blocks
}

function lineToMessage(d: Record<string, unknown>, idx: number): Message | null {
  const type = d.type
  if (type !== 'user' && type !== 'assistant') return null
  const m = d.message as Record<string, unknown> | undefined
  if (!m || typeof m !== 'object') return null
  const blocks = mapContent(m.content)
  if (blocks.length === 0) return null
  const role: Role = type === 'user' ? 'user' : 'assistant'
  const usageRaw = m.usage as Record<string, unknown> | undefined
  const usage = usageRaw
    ? {
        inputTokens: Number(usageRaw.input_tokens) || undefined,
        outputTokens: Number(usageRaw.output_tokens) || undefined,
      }
    : undefined
  return {
    id: String(d.uuid ?? `${role}-${idx}`),
    role,
    ts: d.timestamp as string | undefined,
    model: m.model as string | undefined,
    usage,
    blocks,
  }
}

async function summarize(filePath: string, projDir: string): Promise<SessionSummary> {
  const stat = await fs.stat(filePath)
  const head = await readHeadWindow(filePath, 64 * 1024)
  let title = ''
  let projectPath = ''
  let startedAt: string | undefined
  let firstUser = ''
  for (const line of head) {
    const d = safeParse(line)
    if (!d) continue
    if (d.type === 'custom-title' && d.customTitle) title = String(d.customTitle)
    if (!projectPath && d.cwd) projectPath = String(d.cwd)
    if (!startedAt && d.timestamp) startedAt = String(d.timestamp)
    if (!firstUser && d.type === 'user') {
      const m = d.message as Record<string, unknown> | undefined
      const txt = m && mapContent(m.content).find((b) => b.kind === 'text')
      if (txt && txt.kind === 'text') firstUser = cleanPrompt(txt.text)
    }
  }
  if (!projectPath) projectPath = decodeClaudeDir(projDir)
  if (!title) title = firstUser || path.basename(filePath, '.jsonl')
  return {
    id: encodeId(filePath),
    provider: 'claude',
    title: title.slice(0, 120),
    projectPath,
    filePath,
    startedAt,
    updatedAt: stat.mtime.toISOString(),
    sizeBytes: stat.size,
  }
}

const tail: ProviderAdapter['tail'] = async (filePath, fromOffset) => {
  const { lines, nextOffset } = await readLinesFromOffset(filePath, fromOffset)
  const messages: Message[] = []
  let i = 0
  for (const line of lines) {
    const d = safeParse(line)
    if (!d) continue
    if (typeof d.type === 'string' && META_TYPES.has(d.type)) continue
    const msg = lineToMessage(d, i++)
    if (msg) messages.push(msg)
  }
  return { messages, nextOffset }
}

const parse: ProviderAdapter['parse'] = async (filePath) => {
  const base = await summarize(filePath, path.basename(path.dirname(filePath)))
  const { messages } = await tail(filePath, 0)
  return {
    ...base,
    messages,
    messageCount: messages.length,
    model: messages.find((m) => m.model)?.model ?? base.model,
  }
}

async function scanRoot(root: string): Promise<SessionSummary[]> {
  const out: SessionSummary[] = []
  let projectDirs: string[]
  try {
    projectDirs = await fs.readdir(root)
  } catch {
    return out
  }
  for (const proj of projectDirs) {
    const dir = path.join(root, proj)
    let files: string[]
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const file of files) {
      try {
        out.push(await summarize(path.join(dir, file), proj))
      } catch {
        // Skip unreadable files.
      }
    }
  }
  return out
}

const discover: ProviderAdapter['discover'] = () => discoverWithArchive('claude', scanRoot)

export const claude: ProviderAdapter = {
  id: 'claude',
  appendable: true,
  discover,
  parse,
  tail,
}
