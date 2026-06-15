import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import type { Provider } from './adapters/types'

export const HOME = os.homedir()

const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude')
export const CLAUDE_PROJECTS = path.join(CLAUDE_HOME, 'projects')

const CODEX_HOME = process.env.CODEX_HOME || path.join(HOME, '.codex')
export const CODEX_SESSIONS = path.join(CODEX_HOME, 'sessions')

export const GEMINI_TMP = path.join(HOME, '.gemini', 'tmp')

function cursorDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming')
    return path.join(appData, 'Cursor')
  }
  if (process.platform === 'darwin') {
    return path.join(HOME, 'Library', 'Application Support', 'Cursor')
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(HOME, '.config')
  return path.join(xdg, 'Cursor')
}
export const CURSOR_DIR = cursorDir()
export const CURSOR_GLOBAL_DB = path.join(CURSOR_DIR, 'User', 'globalStorage', 'state.vscdb')
export const CURSOR_CLI_CHATS = path.join(HOME, '.cursor', 'chats')
export const ANTIGRAVITY_CLI_DIR = path.join(HOME, '.gemini', 'antigravity-cli')
export const ANTIGRAVITY_CLI_HISTORY = path.join(ANTIGRAVITY_CLI_DIR, 'history.jsonl')

export const ROOTS: Record<Provider, string> = {
  claude: CLAUDE_PROJECTS,
  codex: CODEX_SESSIONS,
  gemini: GEMINI_TMP,
  cursor: CURSOR_DIR,
  'cursor-cli': CURSOR_CLI_CHATS,
  'antigravity-cli': ANTIGRAVITY_CLI_DIR,
}

/** URL-safe session locator: the absolute file path (or composerId), base64url-encoded. */
export function encodeId(filePath: string): string {
  return Buffer.from(filePath).toString('base64url')
}

export function decodeId(id: string): string {
  return Buffer.from(id, 'base64url').toString('utf8')
}

/** Guard against path traversal: is `p` strictly inside `root`? */
export function isWithin(root: string, p: string): boolean {
  const rel = path.relative(root, p)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * Claude encodes the cwd by replacing path separators with '-'. This is lossy
 * (real directories contain '-'), so it is only a fallback label; the
 * authoritative project path comes from the `cwd` field inside each message.
 */
export function decodeClaudeDir(dirName: string): string {
  return dirName.replace(/^-/, '/').replace(/-/g, '/')
}

export function geminiProjectHash(projectPath: string): string {
  return createHash('sha256').update(projectPath).digest('hex')
}

let geminiHashMap: Map<string, string> | null = null

/**
 * Gemini names its session dirs by SHA256(projectPath), which is not reversible.
 * Best-effort: hash candidate project paths (decoded Claude dirs + subdirs of
 * ~/Dev) and look the hash up. Returns null when unmatched (caller shows the hash).
 */
export async function resolveGeminiHash(hash: string): Promise<string | null> {
  if (!geminiHashMap) geminiHashMap = await buildGeminiHashMap()
  return geminiHashMap.get(hash) ?? null
}

async function buildGeminiHashMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const candidates = new Set<string>()

  try {
    const dirs = await fs.readdir(CLAUDE_PROJECTS)
    for (const d of dirs) candidates.add(decodeClaudeDir(d))
  } catch {
    // ignore
  }

  const devRoot = path.join(HOME, 'Dev')
  candidates.add(devRoot)
  try {
    const entries = await fs.readdir(devRoot, { withFileTypes: true })
    for (const e of entries) if (e.isDirectory()) candidates.add(path.join(devRoot, e.name))
  } catch {
    // ignore
  }

  for (const p of candidates) map.set(geminiProjectHash(p), p)
  return map
}
