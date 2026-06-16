import path from 'node:path'
import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CLAUDE_PROJECTS, CURSOR_GLOBAL_DB, CODEX_SESSIONS } from './paths'
import { readHeadWindow, readTailWindow, readLinesFromOffset } from './adapters/jsonl'

const execFileP = promisify(execFile)
const CODEX_SIZE_CAP = 50 * 1024 * 1024

export type UsageProvider = 'claude' | 'cursor' | 'codex'

export interface UsageRow {
  date: string // YYYY-MM-DD (local)
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

/** Token totals grouped by an arbitrary key (project path, git branch, …). */
export interface GroupRow {
  key: string
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
  messages: number
}

/** Simple key → occurrence count (stop reasons, skills, subagents, …). */
export interface CountRow {
  key: string
  count: number
}

export interface ScanResult {
  rows: UsageRow[]
  tools: ToolRow[]
  // Whole-dataset insights (not date-filtered). Present only where the
  // provider's on-disk format carries the underlying field.
  byProject?: GroupRow[]
  byBranch?: GroupRow[]
  stopReasons?: CountRow[]
  skills?: CountRow[]
  subagents?: CountRow[]
}

function safeParse(l: string): Record<string, unknown> | null {
  try {
    return JSON.parse(l)
  } catch {
    return null
  }
}

/** Accepts an ISO string or an epoch-ms number/string; returns local YYYY-MM-DD. */
function toLocalDate(v: unknown): string | null {
  if (v == null) return null
  let t: number
  if (typeof v === 'number') t = v
  else {
    const parsed = Date.parse(String(v))
    if (!Number.isNaN(parsed)) t = parsed
    else {
      const n = Number(v)
      if (!n) return null
      t = n
    }
  }
  if (!t || Number.isNaN(t)) return null
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function bucket(agg: Map<string, UsageRow>, date: string, model: string): UsageRow {
  const key = `${date}|${model}`
  let row = agg.get(key)
  if (!row) {
    row = { date, model, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, messages: 0 }
    agg.set(key, row)
  }
  return row
}

function toolBucket(agg: Map<string, ToolRow>, date: string, tool: string): void {
  const key = `${date}|${tool}`
  const t = agg.get(key)
  if (t) t.count += 1
  else agg.set(key, { date, tool, count: 1 })
}

interface TokenDelta {
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
}

function groupAdd(agg: Map<string, GroupRow>, key: string, d: TokenDelta): void {
  let row = agg.get(key)
  if (!row) {
    row = { key, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, messages: 0 }
    agg.set(key, row)
  }
  row.input += d.input
  row.output += d.output
  row.cacheRead += d.cacheRead
  row.cacheCreate += d.cacheCreate
  row.messages += 1
}

function countInc(agg: Map<string, number>, key: string): void {
  agg.set(key, (agg.get(key) ?? 0) + 1)
}

const groupTokens = (g: GroupRow) => g.input + g.output + g.cacheRead + g.cacheCreate

function groupsOut(m: Map<string, GroupRow>): GroupRow[] {
  return [...m.values()].sort((a, b) => groupTokens(b) - groupTokens(a)).slice(0, 30)
}

function countsOut(m: Map<string, number>): CountRow[] {
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)
}

/** Pull `/skill` and slash-command names out of a raw Claude user line. */
function extractSkills(line: string, skills: Map<string, number>): void {
  const re = /<command-name>([^<]+)<\/command-name>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    const name = m[1].trim()
    if (name) countInc(skills, name)
  }
}

// ── Claude: assistant lines carry usage/model/timestamp/tool_use + cwd, gitBranch,
// stop_reason, isSidechain; user lines may carry slash-command tags. ──
async function scanClaude(): Promise<ScanResult> {
  const agg = new Map<string, UsageRow>()
  const tools = new Map<string, ToolRow>()
  const projects = new Map<string, GroupRow>()
  const branches = new Map<string, GroupRow>()
  const stops = new Map<string, number>()
  const skills = new Map<string, number>()
  const subs = new Map<string, number>()
  let projectDirs: string[]
  try {
    projectDirs = await fs.readdir(CLAUDE_PROJECTS)
  } catch {
    return { rows: [], tools: [] }
  }
  for (const proj of projectDirs) {
    const dir = path.join(CLAUDE_PROJECTS, proj)
    let files: string[]
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const f of files) {
      try {
        const buf = await fs.readFile(path.join(dir, f), 'utf8')
        for (const line of buf.split('\n')) {
          const isAssistant = line.includes('"assistant"')
          const hasCmd = line.includes('command-name')
          if (!isAssistant && !hasCmd) continue
          const d = safeParse(line)
          if (!d) continue
          if (hasCmd && d.type === 'user') extractSkills(line, skills)
          if (d.type !== 'assistant') continue
          const m = d.message as Record<string, unknown> | undefined
          if (!m) continue
          const date = toLocalDate(d.timestamp)
          if (!date) continue
          // tool calls
          const content = m.content
          if (Array.isArray(content)) {
            for (const b of content) {
              if (b && typeof b === 'object' && (b as Record<string, unknown>).type === 'tool_use') {
                toolBucket(tools, date, String((b as Record<string, unknown>).name || 'tool'))
              }
            }
          }
          // tokens
          const u = m.usage as Record<string, unknown> | undefined
          if (u) {
            const delta: TokenDelta = {
              input: Number(u.input_tokens) || 0,
              output: Number(u.output_tokens) || 0,
              cacheRead: Number(u.cache_read_input_tokens) || 0,
              cacheCreate: Number(u.cache_creation_input_tokens) || 0,
            }
            const row = bucket(agg, date, (m.model as string) || 'unknown')
            row.input += delta.input
            row.output += delta.output
            row.cacheRead += delta.cacheRead
            row.cacheCreate += delta.cacheCreate
            row.messages += 1
            if (d.cwd) groupAdd(projects, String(d.cwd), delta)
            if (d.gitBranch) groupAdd(branches, String(d.gitBranch), delta)
            const sr = m.stop_reason
            if (sr) countInc(stops, String(sr))
            if (d.isSidechain === true) countInc(subs, d.agentName ? String(d.agentName) : '(subagent)')
          }
        }
      } catch {
        // skip
      }
    }
  }
  return {
    rows: [...agg.values()],
    tools: [...tools.values()],
    byProject: groupsOut(projects),
    byBranch: groupsOut(branches),
    stopReasons: countsOut(stops),
    skills: countsOut(skills),
    subagents: countsOut(subs),
  }
}

// ── Cursor (IDE): bubbles carry tokenCount + createdAt; model from modelInfo,
// falling back to the composer's modelConfig. No normalized tool data. ──
async function cursorSqlite(sql: string): Promise<Array<Record<string, unknown>>> {
  try {
    const { stdout } = await execFileP('sqlite3', ['-readonly', '-json', CURSOR_GLOBAL_DB, sql], {
      maxBuffer: 256 * 1024 * 1024,
    })
    return stdout.trim() ? JSON.parse(stdout) : []
  } catch {
    return []
  }
}

async function scanCursor(): Promise<ScanResult> {
  const composerModel = new Map<string, string>()
  for (const r of await cursorSqlite(
    "SELECT json_extract(value,'$.composerId') AS id, json_extract(value,'$.modelConfig.modelName') AS model " +
      "FROM cursorDiskKV WHERE key GLOB 'composerData:*'",
  )) {
    const id = r.id ? String(r.id) : ''
    const model = r.model ? String(r.model) : ''
    if (id && model) composerModel.set(id, model)
  }

  const rows = await cursorSqlite(
    "SELECT key AS k, json_extract(value,'$.createdAt') AS ts, " +
      "json_extract(value,'$.modelInfo.modelName') AS model, " +
      "coalesce(json_extract(value,'$.tokenCount.inputTokens'),0) AS inp, " +
      "coalesce(json_extract(value,'$.tokenCount.outputTokens'),0) AS outp " +
      "FROM cursorDiskKV WHERE key GLOB 'bubbleId:*' " +
      "AND (json_extract(value,'$.tokenCount.inputTokens')>0 OR json_extract(value,'$.tokenCount.outputTokens')>0)",
  )

  const agg = new Map<string, UsageRow>()
  for (const r of rows) {
    const date = toLocalDate(r.ts)
    if (!date) continue
    const cid = String(r.k).split(':')[1]
    const model = (r.model ? String(r.model) : '') || composerModel.get(cid) || 'cursor'
    const row = bucket(agg, date, model)
    row.input += Number(r.inp) || 0
    row.output += Number(r.outp) || 0
    row.messages += 1
  }
  return { rows: [...agg.values()], tools: [] }
}

// ── Codex: token_count events (usage) + response_item function_call (tools);
// session_meta carries cwd + git for project/branch grouping. ──
function extractCodexUsage(lines: string[]): { input: number; output: number; cacheRead: number } | null {
  let last: Record<string, unknown> | null = null
  for (const line of lines) {
    const d = safeParse(line)
    const p = d?.payload as Record<string, unknown> | undefined
    if (d?.type === 'event_msg' && p?.type === 'token_count') {
      const info = (p.info ?? p) as Record<string, unknown>
      const tot = (info.total_token_usage ?? info.totalTokenUsage) as Record<string, unknown> | undefined
      if (tot) last = tot
    }
  }
  if (!last) return null
  const input = Number(last.input_tokens ?? last.inputTokens ?? 0)
  const output = Number(last.output_tokens ?? last.outputTokens ?? 0)
  const cacheRead = Number(last.cached_input_tokens ?? last.cache_read_input_tokens ?? 0)
  if (!input && !output) return null
  return { input, output, cacheRead }
}

function codexBranch(git: unknown): string {
  if (!git || typeof git !== 'object') return ''
  const g = git as Record<string, unknown>
  return String(g.branch ?? g.branch_name ?? g.ref ?? '') || ''
}

function countCodexTools(lines: string[], date: string, tools: Map<string, ToolRow>): void {
  for (const line of lines) {
    if (!line.includes('response_item')) continue
    const d = safeParse(line)
    const p = d?.payload as Record<string, unknown> | undefined
    if (d?.type !== 'response_item' || !p) continue
    if (p.type === 'function_call') toolBucket(tools, date, String(p.name || 'tool'))
    else if (p.type === 'local_shell_call') toolBucket(tools, date, 'shell')
  }
}

async function walkCodex(dir: string, out: string[] = []): Promise<string[]> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const fp = path.join(dir, e.name)
    if (e.isDirectory()) await walkCodex(fp, out)
    else if (e.isFile() && e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) out.push(fp)
  }
  return out
}

async function scanCodex(): Promise<ScanResult> {
  const agg = new Map<string, UsageRow>()
  const tools = new Map<string, ToolRow>()
  const projects = new Map<string, GroupRow>()
  const branches = new Map<string, GroupRow>()
  const files = await walkCodex(CODEX_SESSIONS)
  for (const fp of files) {
    try {
      const head = await readHeadWindow(fp, 64 * 1024)
      let date: string | null = null
      let model = 'gpt (codex)'
      let cwd = ''
      let branch = ''
      for (const line of head) {
        const d = safeParse(line)
        if (!d) continue
        if (d.type === 'session_meta' && d.payload) {
          const p = d.payload as Record<string, unknown>
          date = toLocalDate((p.timestamp as string) ?? d.timestamp)
          model = (p.model as string) || model
          if (p.cwd) cwd = String(p.cwd)
          if (!branch) branch = codexBranch(p.git)
        }
        if (d.type === 'turn_context') {
          const p = d.payload as Record<string, unknown> | undefined
          if (p?.model) model = String(p.model)
          if (p?.cwd && !cwd) cwd = String(p.cwd)
        }
      }
      if (!date) continue
      const stat = await fs.stat(fp)
      let allLines: string[]
      let tailLines: string[]
      if (stat.size <= CODEX_SIZE_CAP) {
        const r = await readLinesFromOffset(fp, 0)
        allLines = r.lines
        tailLines = r.lines
      } else {
        const r = await readTailWindow(fp, 4 * 1024 * 1024)
        tailLines = r.lines
        allLines = [...head, ...r.lines] // tools in the omitted middle are missed
      }
      const usage = extractCodexUsage(tailLines)
      if (usage) {
        const delta: TokenDelta = { ...usage, cacheCreate: 0 }
        const row = bucket(agg, date, model)
        row.input += usage.input
        row.output += usage.output
        row.cacheRead += usage.cacheRead
        row.messages += 1
        if (cwd) groupAdd(projects, cwd, delta)
        if (branch) groupAdd(branches, branch, delta)
      }
      countCodexTools(allLines, date, tools)
    } catch {
      // skip
    }
  }
  return {
    rows: [...agg.values()],
    tools: [...tools.values()],
    byProject: groupsOut(projects),
    byBranch: groupsOut(branches),
  }
}

/** Aggregate token usage + tool usage + insights by date for one provider. */
export async function scanUsage(provider: string): Promise<ScanResult> {
  let res: ScanResult
  if (provider === 'cursor') res = await scanCursor()
  else if (provider === 'codex') res = await scanCodex()
  else res = await scanClaude()
  res.rows.sort((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model))
  res.tools.sort((a, b) => b.count - a.count)
  return res
}
