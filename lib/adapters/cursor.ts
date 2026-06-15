import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CURSOR_GLOBAL_DB, encodeId } from '../paths'
import { getIgnore } from '../store'
import type { ProviderAdapter, SessionSummary, Message, Role } from './types'

const execFileP = promisify(execFile)
const MAX_BUFFER = 512 * 1024 * 1024
const ID_RE = /^[0-9a-fA-F-]{8,64}$/

async function sqliteJson(sql: string): Promise<Array<Record<string, unknown>>> {
  try {
    const { stdout } = await execFileP(
      'sqlite3',
      ['-readonly', '-json', CURSOR_GLOBAL_DB, sql],
      { maxBuffer: MAX_BUFFER },
    )
    const s = stdout.trim()
    return s ? (JSON.parse(s) as Array<Record<string, unknown>>) : []
  } catch {
    return []
  }
}

function roleFromType(t: unknown): Role {
  return Number(t) === 1 ? 'user' : 'assistant'
}

function toIso(ms: unknown): string | undefined {
  const n = Number(ms)
  if (!n || Number.isNaN(n)) return undefined
  return new Date(n).toISOString()
}

interface Header {
  bubbleId: string
  type: number
}

const discover: ProviderAdapter['discover'] = async () => {
  const ignore = await getIgnore('cursor')
  const rows = await sqliteJson(
    "SELECT json_extract(value,'$.composerId') AS id, " +
      "json_extract(value,'$.name') AS name, " +
      "json_extract(value,'$.modelConfig.modelName') AS model, " +
      "json_extract(value,'$.createdAt') AS createdAt, " +
      "json_extract(value,'$.lastUpdatedAt') AS lastUpdatedAt, " +
      "json_array_length(value,'$.fullConversationHeadersOnly') AS n " +
      "FROM cursorDiskKV WHERE key GLOB 'composerData:*' " +
      "AND json_array_length(value,'$.fullConversationHeadersOnly') > 0",
  )
  const out: SessionSummary[] = []
  for (const r of rows) {
    if (!r.id) continue
    const id = String(r.id)
    if (ignore.has(id)) continue // hidden by the user
    out.push({
      id: encodeId(id),
      provider: 'cursor',
      title: (String(r.name ?? '') || '(untitled)').slice(0, 120),
      projectPath: 'Cursor',
      filePath: id,
      startedAt: toIso(r.createdAt),
      updatedAt: toIso(r.lastUpdatedAt) ?? toIso(r.createdAt),
      messageCount: Number(r.n) || 0,
      model: String(r.model ?? '') || 'cursor',
    })
  }
  return out
}

const parse: ProviderAdapter['parse'] = async (composerId) => {
  const base: SessionSummary = {
    id: encodeId(composerId),
    provider: 'cursor',
    title: '(untitled)',
    projectPath: 'Cursor',
    filePath: composerId,
    model: 'cursor',
  }
  if (!ID_RE.test(composerId)) return { ...base, title: '(invalid)', messages: [] }

  const metaRows = await sqliteJson(
    "SELECT json_extract(value,'$.name') AS name, " +
      "json_extract(value,'$.modelConfig.modelName') AS model, " +
      "json_extract(value,'$.createdAt') AS createdAt, " +
      "json_extract(value,'$.lastUpdatedAt') AS lastUpdatedAt, " +
      "json_extract(value,'$.fullConversationHeadersOnly') AS headers " +
      `FROM cursorDiskKV WHERE key = 'composerData:${composerId}'`,
  )
  const meta = metaRows[0] ?? {}
  let headers: Header[] = []
  try {
    headers = JSON.parse(String(meta.headers ?? '[]'))
  } catch {
    headers = []
  }

  const bubbleRows = await sqliteJson(
    "SELECT key AS k, json_extract(value,'$.type') AS type, json_extract(value,'$.text') AS text, " +
      "json_extract(value,'$.modelInfo.modelName') AS bmodel, " +
      "json_extract(value,'$.tokenCount.inputTokens') AS ti, " +
      "json_extract(value,'$.tokenCount.outputTokens') AS toks " +
      `FROM cursorDiskKV WHERE key GLOB 'bubbleId:${composerId}:*'`,
  )
  const byId = new Map<string, { type: number; text: string; model?: string; ti: number; toks: number }>()
  for (const b of bubbleRows) {
    const bid = String(b.k).split(':')[2]
    byId.set(bid, {
      type: Number(b.type),
      text: String(b.text ?? ''),
      model: b.bmodel ? String(b.bmodel) : undefined,
      ti: Number(b.ti) || 0,
      toks: Number(b.toks) || 0,
    })
  }

  const messages: Message[] = []
  headers.forEach((h, i) => {
    const rec = byId.get(h.bubbleId)
    const text = rec?.text ?? ''
    if (!text.trim()) return
    const usage =
      rec && (rec.ti > 0 || rec.toks > 0) ? { inputTokens: rec.ti, outputTokens: rec.toks } : undefined
    messages.push({
      id: `${h.bubbleId}-${i}`,
      role: roleFromType(h.type ?? rec?.type),
      model: rec?.model,
      blocks: [{ kind: 'text', text }],
      usage,
    })
  })

  return {
    ...base,
    model: String(meta.model ?? '') || 'cursor',
    title: (String(meta.name ?? '') || '(untitled)').slice(0, 120),
    startedAt: toIso(meta.createdAt),
    updatedAt: toIso(meta.lastUpdatedAt) ?? toIso(meta.createdAt),
    messageCount: messages.length,
    messages,
  }
}

const tail: ProviderAdapter['tail'] = async (composerId) => {
  const s = await parse(composerId)
  return { messages: s.messages, nextOffset: 0 }
}

export const cursor: ProviderAdapter = {
  id: 'cursor',
  appendable: false,
  discover,
  parse,
  tail,
}
