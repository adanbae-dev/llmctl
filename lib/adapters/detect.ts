import path from 'node:path'
import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  CLAUDE_PROJECTS,
  CODEX_SESSIONS,
  GEMINI_TMP,
  CURSOR_DIR,
  CURSOR_GLOBAL_DB,
  CURSOR_CLI_CHATS,
  ANTIGRAVITY_CLI_DIR,
  ANTIGRAVITY_CLI_HISTORY,
} from '../paths'
import type { ProviderStatus } from './types'

const execFileP = promisify(execFile)

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function which(name: string): Promise<boolean> {
  try {
    await execFileP('which', [name])
    return true
  } catch {
    return false
  }
}

async function version(name: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileP(name, ['--version'], { timeout: 3000, maxBuffer: 256 * 1024 })
    return stdout.trim().split('\n')[0].slice(0, 40) || undefined
  } catch {
    return undefined
  }
}

async function countClaude(): Promise<number> {
  let n = 0
  let dirs: string[]
  try {
    dirs = await fs.readdir(CLAUDE_PROJECTS)
  } catch {
    return 0
  }
  for (const d of dirs) {
    try {
      n += (await fs.readdir(path.join(CLAUDE_PROJECTS, d))).filter((f) => f.endsWith('.jsonl')).length
    } catch {
      // ignore
    }
  }
  return n
}

async function countCodex(): Promise<number> {
  let n = 0
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const fp = path.join(dir, e.name)
      if (e.isDirectory()) await walk(fp)
      else if (e.isFile() && e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) n++
    }
  }
  await walk(CODEX_SESSIONS)
  return n
}

async function countGemini(): Promise<number> {
  let n = 0
  let hashes: string[]
  try {
    hashes = await fs.readdir(GEMINI_TMP)
  } catch {
    return 0
  }
  for (const h of hashes) {
    try {
      n += (await fs.readdir(path.join(GEMINI_TMP, h, 'chats'))).filter(
        (f) => f.startsWith('session-') && (f.endsWith('.json') || f.endsWith('.jsonl')),
      ).length
    } catch {
      // ignore
    }
  }
  return n
}

async function countCursor(): Promise<number> {
  try {
    const { stdout } = await execFileP(
      'sqlite3',
      [
        '-readonly',
        CURSOR_GLOBAL_DB,
        "SELECT count(*) FROM cursorDiskKV WHERE key GLOB 'composerData:*' " +
          "AND json_array_length(value,'$.fullConversationHeadersOnly') > 0",
      ],
      { maxBuffer: 1024 * 1024 },
    )
    return parseInt(stdout.trim(), 10) || 0
  } catch {
    return 0
  }
}

async function countCursorCli(): Promise<number> {
  let n = 0
  let projs: string[]
  try {
    projs = await fs.readdir(CURSOR_CLI_CHATS)
  } catch {
    return 0
  }
  for (const p of projs) {
    let sids: string[]
    try {
      sids = await fs.readdir(path.join(CURSOR_CLI_CHATS, p))
    } catch {
      continue
    }
    for (const sid of sids) {
      if (await exists(path.join(CURSOR_CLI_CHATS, p, sid, 'store.db'))) n++
    }
  }
  return n
}

async function countAntigravityCli(): Promise<number> {
  try {
    const buf = await fs.readFile(ANTIGRAVITY_CLI_HISTORY, 'utf8')
    const ids = new Set<string>()
    for (const l of buf.split('\n')) {
      if (!l.trim()) continue
      try {
        const d = JSON.parse(l)
        if (d.conversationId) ids.add(d.conversationId)
      } catch {
        // ignore
      }
    }
    return ids.size
  } catch {
    return 0
  }
}

export async function detectProviders(): Promise<ProviderStatus[]> {
  return Promise.all([
    (async (): Promise<ProviderStatus> => {
      const [root, bin] = await Promise.all([exists(CLAUDE_PROJECTS), which('claude')])
      return {
        id: 'claude',
        installed: root || bin,
        sessionCount: root ? await countClaude() : 0,
        dataRoot: root ? CLAUDE_PROJECTS : undefined,
        binary: bin ? 'claude' : undefined,
        version: bin ? await version('claude') : undefined,
      }
    })(),
    (async (): Promise<ProviderStatus> => {
      const [root, bin] = await Promise.all([exists(CODEX_SESSIONS), which('codex')])
      return {
        id: 'codex',
        installed: root || bin,
        sessionCount: root ? await countCodex() : 0,
        dataRoot: root ? CODEX_SESSIONS : undefined,
        binary: bin ? 'codex' : undefined,
        version: bin ? await version('codex') : undefined,
      }
    })(),
    (async (): Promise<ProviderStatus> => {
      const [root, bin] = await Promise.all([exists(GEMINI_TMP), which('gemini')])
      return {
        id: 'gemini',
        installed: root || bin,
        sessionCount: root ? await countGemini() : 0,
        dataRoot: root ? GEMINI_TMP : undefined,
        binary: bin ? 'gemini' : undefined,
        version: bin ? await version('gemini') : undefined,
      }
    })(),
    (async (): Promise<ProviderStatus> => {
      const dbExists = await exists(CURSOR_GLOBAL_DB)
      return {
        id: 'cursor',
        installed: dbExists,
        sessionCount: dbExists ? await countCursor() : 0,
        dataRoot: dbExists ? CURSOR_DIR : undefined,
      }
    })(),
    (async (): Promise<ProviderStatus> => {
      const [root, bin] = await Promise.all([
        exists(CURSOR_CLI_CHATS),
        (async () => (await which('cursor-agent')) || (await which('cursor')))(),
      ])
      return {
        id: 'cursor-cli',
        installed: root || bin,
        sessionCount: root ? await countCursorCli() : 0,
        dataRoot: root ? CURSOR_CLI_CHATS : undefined,
        binary: bin ? 'cursor-agent' : undefined,
      }
    })(),
    (async (): Promise<ProviderStatus> => {
      const root = await exists(ANTIGRAVITY_CLI_HISTORY)
      return {
        id: 'antigravity-cli',
        installed: root,
        sessionCount: root ? await countAntigravityCli() : 0,
        dataRoot: root ? ANTIGRAVITY_CLI_DIR : undefined,
      }
    })(),
  ])
}
