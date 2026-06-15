import path from 'node:path'
import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CURSOR_CLI_CHATS, encodeId } from '../paths'
import type { ProviderAdapter, SessionSummary, Message, Role } from './types'

const execFileP = promisify(execFile)
const MAX_BUFFER = 256 * 1024 * 1024

// Cursor CLI stores each chat as its own SQLite store.db (with WAL). We read it
// live and lock-free via the immutable URI — no copying.
async function sqlite(dbPath: string, sql: string): Promise<Array<Record<string, unknown>>> {
  try {
    const { stdout } = await execFileP('sqlite3', ['-json', `file:${dbPath}?immutable=1`, sql], {
      maxBuffer: MAX_BUFFER,
    })
    const s = stdout.trim()
    return s ? (JSON.parse(s) as Array<Record<string, unknown>>) : []
  } catch {
    return []
  }
}

async function readMeta(dbPath: string): Promise<{ name?: string; agentId?: string }> {
  const rows = await sqlite(dbPath, 'SELECT hex(value) AS h FROM meta LIMIT 1')
  const h = rows[0]?.h
  if (!h) return {}
  try {
    return JSON.parse(Buffer.from(String(h), 'hex').toString('utf8'))
  } catch {
    return {}
  }
}

function mapRole(r: unknown): Role {
  if (r === 'user') return 'user'
  if (r === 'assistant') return 'assistant'
  if (r === 'tool') return 'tool'
  return 'system'
}

function contentToText(c: unknown): string {
  if (typeof c === 'string') return c
  if (Array.isArray(c))
    return c
      .map((x) => (typeof x === 'string' ? x : String((x as Record<string, unknown>)?.text ?? '')))
      .filter(Boolean)
      .join('')
  return c != null ? JSON.stringify(c) : ''
}

function cleanUser(s: string): string {
  // The real human prompt is wrapped in <user_query>; prefer that.
  const q = s.match(/<user_query>([\s\S]*?)<\/user_query>/)
  if (q && q[1].trim()) return q[1].trim()
  // No query wrapper: drop pure context-injection messages.
  if (
    /<(user_info|git_status|agent_transcripts|additional_data|system_reminder|attached_files|current_file|linter_errors|recently_viewed_files|cursor_rules|todo_list|files|manually_added_selection|relevant_files)>/.test(
      s,
    )
  )
    return ''
  return s.trim()
}

// Title fallback when meta.name is empty: the first user prompt in the session.
async function firstUserPrompt(dbPath: string): Promise<string> {
  const rows = await sqlite(dbPath, 'SELECT data FROM blobs ORDER BY rowid LIMIT 60')
  for (const r of rows) {
    let d: Record<string, unknown>
    try {
      d = JSON.parse(String(r.data))
    } catch {
      continue
    }
    if (d?.role === 'user') {
      const t = cleanUser(contentToText(d.content))
      if (t.trim()) return t.replace(/\s+/g, ' ')
    }
  }
  return ''
}

function projLabel(dbPath: string): string {
  const hash = path.basename(path.dirname(path.dirname(dbPath)))
  return `cursor-cli:${hash.slice(0, 10)}…`
}

const tail: ProviderAdapter['tail'] = async (dbPath) => {
  const s = await parse(dbPath)
  return { messages: s.messages, nextOffset: 0 }
}

const parse: ProviderAdapter['parse'] = async (dbPath) => {
  const stat = await fs.stat(dbPath).catch(() => null)
  const meta = await readMeta(dbPath)
  const rows = await sqlite(dbPath, 'SELECT data FROM blobs ORDER BY rowid')
  const messages: Message[] = []
  rows.forEach((r, i) => {
    let d: Record<string, unknown>
    try {
      d = JSON.parse(String(r.data))
    } catch {
      return
    }
    if (!d || typeof d !== 'object') return
    const role = mapRole(d.role)
    if (role === 'system') return // skip the long system prompt
    let text = contentToText(d.content)
    if (role === 'user') text = cleanUser(text)
    if (!text.trim()) return
    messages.push({ id: `cc-${i}`, role, blocks: [{ kind: 'text', text }] })
  })
  // Title: meta.name → first user prompt → session dir name.
  const firstUser = messages.find((m) => m.role === 'user')
  const fuText =
    firstUser && firstUser.blocks[0]?.kind === 'text' ? firstUser.blocks[0].text.replace(/\s+/g, ' ') : ''
  return {
    id: encodeId(dbPath),
    provider: 'cursor-cli',
    title: (meta.name || fuText || path.basename(path.dirname(dbPath))).slice(0, 120),
    projectPath: projLabel(dbPath),
    filePath: dbPath,
    updatedAt: stat?.mtime.toISOString(),
    sizeBytes: stat?.size,
    model: 'cursor (composer)',
    messageCount: messages.length,
    messages,
  }
}

const discover: ProviderAdapter['discover'] = async () => {
  const out: SessionSummary[] = []
  let projDirs: string[]
  try {
    projDirs = await fs.readdir(CURSOR_CLI_CHATS)
  } catch {
    return out
  }
  for (const ph of projDirs) {
    const projDir = path.join(CURSOR_CLI_CHATS, ph)
    let sessions: string[]
    try {
      sessions = await fs.readdir(projDir)
    } catch {
      continue
    }
    for (const sid of sessions) {
      const dbPath = path.join(projDir, sid, 'store.db')
      try {
        const stat = await fs.stat(dbPath)
        const meta = await readMeta(dbPath)
        const title = meta.name || (await firstUserPrompt(dbPath)) || sid
        out.push({
          id: encodeId(dbPath),
          provider: 'cursor-cli',
          title: title.slice(0, 120),
          projectPath: `cursor-cli:${ph.slice(0, 10)}…`,
          filePath: dbPath,
          updatedAt: stat.mtime.toISOString(),
          sizeBytes: stat.size,
          model: 'cursor (composer)',
        })
      } catch {
        // no store.db here — skip
      }
    }
  }
  return out
}

export const cursorCli: ProviderAdapter = {
  id: 'cursor-cli',
  appendable: false,
  discover,
  parse,
  tail,
}
