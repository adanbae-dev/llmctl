import path from 'node:path'
import { promises as fs } from 'node:fs'
import { encodeId, resolveGeminiHash } from '../paths'
import { discoverWithArchive } from './archive'
import type {
  ProviderAdapter,
  Session,
  SessionSummary,
  Message,
  ContentBlock,
  TailResult,
} from './types'

interface GeminiRawMessage {
  id?: string
  type?: string
  role?: string
  content?: unknown
  timestamp?: string
  thoughts?: Array<{ subject?: string; description?: string }>
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function mapMessages(raw: GeminiRawMessage[]): Message[] {
  const out: Message[] = []
  raw.forEach((m, i) => {
    if (!m || typeof m !== 'object') return
    const role = m.type === 'user' || m.role === 'user' ? 'user' : 'assistant'
    const blocks: ContentBlock[] = []
    if (Array.isArray(m.thoughts) && m.thoughts.length) {
      const text = m.thoughts
        .map((t) =>
          t?.subject ? `**${t.subject}**\n\n${t.description ?? ''}` : String(t?.description ?? ''),
        )
        .filter((s) => s.trim())
        .join('\n\n---\n\n')
      if (text.trim()) blocks.push({ kind: 'thinking', text })
    }
    const content =
      typeof m.content === 'string'
        ? m.content
        : m.content != null
          ? JSON.stringify(m.content)
          : ''
    if (content.trim()) blocks.push({ kind: 'text', text: content })
    if (blocks.length) out.push({ id: String(m.id ?? `g-${i}`), role, ts: m.timestamp, blocks })
  })
  return out
}

interface LoadedSession {
  messages: Message[]
  sessionId?: string
  startTime?: string
  lastUpdated?: string
}

// Gemini is mid-migration from a single JSON object to JSONL. Handle both.
async function loadSession(filePath: string): Promise<LoadedSession> {
  const buf = await fs.readFile(filePath, 'utf8')
  if (filePath.endsWith('.jsonl')) {
    const lines = buf.split('\n').filter((l) => l.trim())
    let meta: Record<string, unknown> | null = null
    const msgs: GeminiRawMessage[] = []
    for (const l of lines) {
      const d = safeParse(l)
      if (!d) continue
      if (d.type === 'user' || d.type === 'gemini' || d.role || d.content) {
        msgs.push(d as GeminiRawMessage)
      } else if (d.sessionId || d.messages) {
        meta = d
      }
    }
    return {
      messages: mapMessages(msgs),
      sessionId: meta?.sessionId as string | undefined,
      startTime: meta?.startTime as string | undefined,
      lastUpdated: meta?.lastUpdated as string | undefined,
    }
  }
  const data = (safeParse(buf) ?? {}) as Record<string, unknown>
  return {
    messages: mapMessages(Array.isArray(data.messages) ? (data.messages as GeminiRawMessage[]) : []),
    sessionId: data.sessionId as string | undefined,
    startTime: data.startTime as string | undefined,
    lastUpdated: data.lastUpdated as string | undefined,
  }
}

function hashFromPath(filePath: string): string {
  // .../tmp/<hash>/chats/session-*.json
  return path.basename(path.dirname(path.dirname(filePath)))
}

function firstUserText(messages: Message[]): string {
  const u = messages.find((m) => m.role === 'user')
  const b = u?.blocks.find((x) => x.kind === 'text')
  return b && b.kind === 'text' ? b.text : ''
}

async function projectLabel(hash: string): Promise<string> {
  return (await resolveGeminiHash(hash)) ?? `gemini:${hash.slice(0, 12)}…`
}

async function summarize(filePath: string): Promise<SessionSummary> {
  const stat = await fs.stat(filePath)
  const s = await loadSession(filePath)
  return {
    id: encodeId(filePath),
    provider: 'gemini',
    title: (firstUserText(s.messages) || path.basename(filePath)).slice(0, 120),
    projectPath: await projectLabel(hashFromPath(filePath)),
    filePath,
    startedAt: s.startTime,
    updatedAt: s.lastUpdated ?? stat.mtime.toISOString(),
    sizeBytes: stat.size,
    messageCount: s.messages.length,
    model: 'gemini',
  }
}

const tail: ProviderAdapter['tail'] = async (filePath) => {
  // Non-appendable (whole-file rewrite): re-read fully, report size as offset.
  const s = await loadSession(filePath)
  const { size } = await fs.stat(filePath)
  return { messages: s.messages, nextOffset: size }
}

const parse: ProviderAdapter['parse'] = async (filePath) => {
  const base = await summarize(filePath)
  const s = await loadSession(filePath)
  return { ...base, messages: s.messages }
}

async function scanRoot(root: string): Promise<SessionSummary[]> {
  const out: SessionSummary[] = []
  let hashes: string[]
  try {
    hashes = await fs.readdir(root)
  } catch {
    return out
  }
  for (const h of hashes) {
    const chatsDir = path.join(root, h, 'chats')
    let files: string[]
    try {
      files = (await fs.readdir(chatsDir)).filter(
        (f) => f.startsWith('session-') && (f.endsWith('.json') || f.endsWith('.jsonl')),
      )
    } catch {
      continue
    }
    for (const f of files) {
      try {
        out.push(await summarize(path.join(chatsDir, f)))
      } catch {
        // Skip unreadable files.
      }
    }
  }
  return out
}

const discover: ProviderAdapter['discover'] = () => discoverWithArchive('gemini', scanRoot)

export const gemini: ProviderAdapter = {
  id: 'gemini',
  appendable: false,
  discover,
  parse,
  tail,
}
