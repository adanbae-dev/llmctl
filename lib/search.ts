// Cross-session full-text search. Scans discovered sessions (all providers,
// incl. archive) for a query string and returns the sessions + the individual
// messages that match, each carrying the message id so the conversation view
// can scroll straight to it (same anchor the Security jump uses).
//
// Speed: file-based sessions get a cheap substring pre-filter (read raw text,
// skip if it doesn't contain the query) and are only fully parsed on a hit.
// DB-backed providers (no readable file) are parsed directly. Bounded
// concurrency + hard caps keep an on-demand query responsive.

import { promises as fs } from 'node:fs'
import { discoverAll, getAdapter } from './adapters'
import { decodeId } from './paths'
import type { Message, Provider, SessionSummary } from './adapters/types'

export interface SearchMatch {
  messageId: string // Message.id → ConversationView `data-msg-id` anchor
  role: string
  snippet: string // ±context around the first occurrence, whitespace-collapsed
}

export interface SearchHit {
  id: string
  provider: Provider
  title: string
  project: string
  date: string
  matchCount: number // messages in this session that matched
  matches: SearchMatch[] // first MAX_MATCHES, in conversation order
}

export interface SearchResult {
  hits: SearchHit[]
  parsed: number // sessions actually parsed (candidates that passed pre-filter)
  capped: boolean // true if candidates exceeded MAX_PARSE (results may be partial)
}

const MIN_QUERY = 2
const READ_LIMIT = 16 // concurrent file reads / parses
const MAX_PARSE = 300 // cap fully-parsed sessions per query
const MAX_HITS = 60 // cap returned sessions
const MAX_MATCHES = 5 // cap matches surfaced per session
const SNIPPET_PAD = 60 // chars of context on each side of the match

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

function locatorOf(s: SessionSummary): string {
  try {
    return decodeId(s.id)
  } catch {
    return s.filePath
  }
}

// All searchable text in a message: prose, thinking, tool names/inputs, results.
function messageText(m: Message): string {
  const parts: string[] = []
  for (const b of m.blocks) {
    if (b.kind === 'text' || b.kind === 'thinking') parts.push(b.text)
    else if (b.kind === 'tool_use') parts.push(`${b.name} ${safeStringify(b.input)}`)
    else if (b.kind === 'tool_result') parts.push(b.output)
  }
  return parts.join('\n')
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v)
  } catch {
    return ''
  }
}

function makeSnippet(text: string, qLower: string): string {
  const i = text.toLowerCase().indexOf(qLower)
  if (i < 0) return ''
  const start = Math.max(0, i - SNIPPET_PAD)
  const end = Math.min(text.length, i + qLower.length + SNIPPET_PAD)
  let s = text.slice(start, end).replace(/\s+/g, ' ').trim()
  if (start > 0) s = `…${s}`
  if (end < text.length) s = `${s}…`
  return s
}

export async function searchSessions(query: string): Promise<SearchResult> {
  const q = query.trim()
  if (q.length < MIN_QUERY) return { hits: [], parsed: 0, capped: false }
  const qLower = q.toLowerCase()

  const sessions = await discoverAll() // newest first
  // Phase A — cheap pre-filter: keep sessions whose raw file contains the query.
  // A read failure (DB-backed provider) keeps the session as a parse candidate.
  const pass = await mapLimit(sessions, READ_LIMIT, async (s) => {
    if (!getAdapter(s.provider)) return false
    try {
      const buf = await fs.readFile(locatorOf(s), 'utf8')
      return buf.toLowerCase().includes(qLower)
    } catch {
      return true // not a readable file → parse it to decide
    }
  })
  let candidates = sessions.filter((_, i) => pass[i])
  const capped = candidates.length > MAX_PARSE
  if (capped) candidates = candidates.slice(0, MAX_PARSE)

  // Phase B — parse candidates and collect message-level matches.
  const hits: SearchHit[] = []
  await mapLimit(candidates, READ_LIMIT, async (s) => {
    const adapter = getAdapter(s.provider)!
    let messages: Message[]
    try {
      messages = (await adapter.parse(locatorOf(s))).messages
    } catch {
      return
    }
    const matches: SearchMatch[] = []
    let matchCount = 0
    for (const m of messages) {
      const text = messageText(m)
      if (!text.toLowerCase().includes(qLower)) continue
      matchCount += 1
      if (matches.length < MAX_MATCHES) {
        matches.push({ messageId: m.id, role: m.role, snippet: makeSnippet(text, qLower) })
      }
    }
    if (matchCount > 0) {
      hits.push({
        id: s.id,
        provider: s.provider,
        title: s.title,
        project: s.projectPath,
        date: (s.updatedAt ?? s.startedAt ?? '').slice(0, 10),
        matchCount,
        matches,
      })
    }
  })

  hits.sort((a, b) => b.matchCount - a.matchCount || b.date.localeCompare(a.date))
  return { hits: hits.slice(0, MAX_HITS), parsed: candidates.length, capped }
}
