import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { CLAUDE_PROJECTS, CODEX_SESSIONS, GEMINI_TMP } from './paths'

/** Archive root — survives Claude Code's session cleanup (cleanupPeriodDays). */
export const ARCHIVE_DIR = path.join(os.homedir(), '.llmctl', 'archive')

interface Target {
  provider: string
  src: string
  dest: string
}

// File-based session roots, mirroring the rsync backup (claude/codex/gemini).
// DB-backed providers (cursor, antigravity) are shared SQLite stores the app
// treats read-only and are intentionally out of scope here.
const TARGETS: Target[] = [
  { provider: 'claude', src: CLAUDE_PROJECTS, dest: path.join(ARCHIVE_DIR, 'claude', 'projects') },
  { provider: 'codex', src: CODEX_SESSIONS, dest: path.join(ARCHIVE_DIR, 'codex', 'sessions') },
  { provider: 'gemini', src: GEMINI_TMP, dest: path.join(ARCHIVE_DIR, 'gemini', 'tmp') },
]

export interface BackupTargetResult {
  provider: string
  src: string
  dest: string
  present: boolean
  filesCopied: number
  filesSkipped: number
  bytesCopied: number
  error?: string
}

export interface BackupResult {
  archiveDir: string
  targets: BackupTargetResult[]
  filesCopied: number
  filesSkipped: number
  bytesCopied: number
  archiveBytes: number
  durationMs: number
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

interface Acc {
  copied: number
  skipped: number
  bytes: number
}

/**
 * Incrementally mirror `src` into `dest` with rsync `--update` semantics: copy a
 * file only when it is missing at the destination, a different size, or newer at
 * the source. The source is only ever read; copies keep their original mtime so
 * subsequent runs stay cheap and idempotent.
 */
async function syncDir(src: string, dest: string, acc: Acc): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true })
  await fs.mkdir(dest, { recursive: true })
  for (const e of entries) {
    const s = path.join(src, e.name)
    const d = path.join(dest, e.name)
    if (e.isDirectory()) {
      await syncDir(s, d, acc)
    } else if (e.isFile()) {
      const srcStat = await fs.stat(s)
      let copy = true
      try {
        const dStat = await fs.stat(d)
        // Compare mtime at whole-second granularity: copyFile + utimes only
        // preserves times to ~ms while source mtimes carry sub-ms precision, so
        // an exact ">=" check would recopy unchanged files forever (the same
        // trap that bites old rsync). Size guards against same-second edits.
        const sameSize = dStat.size === srcStat.size
        const destNotOlder = Math.floor(dStat.mtimeMs / 1000) >= Math.floor(srcStat.mtimeMs / 1000)
        if (sameSize && destNotOlder) copy = false
      } catch {
        // dest missing -> copy
      }
      if (copy) {
        await fs.copyFile(s, d)
        await fs.utimes(d, srcStat.atime, srcStat.mtime)
        acc.copied++
        acc.bytes += srcStat.size
      } else {
        acc.skipped++
      }
    }
    // symlinks / other entry types are skipped (no source mutation, no surprises)
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) total += await dirSize(p)
    else if (e.isFile()) {
      try {
        total += (await fs.stat(p)).size
      } catch {
        // ignore unreadable file
      }
    }
  }
  return total
}

/** Run an incremental backup of all file-based session roots into ARCHIVE_DIR. */
export async function runBackup(): Promise<BackupResult> {
  const started = Date.now()
  await fs.mkdir(ARCHIVE_DIR, { recursive: true })

  const targets: BackupTargetResult[] = []
  for (const t of TARGETS) {
    const acc: Acc = { copied: 0, skipped: 0, bytes: 0 }
    if (!(await exists(t.src))) {
      targets.push({ ...t, present: false, filesCopied: 0, filesSkipped: 0, bytesCopied: 0 })
      continue
    }
    try {
      await syncDir(t.src, t.dest, acc)
      targets.push({
        ...t,
        present: true,
        filesCopied: acc.copied,
        filesSkipped: acc.skipped,
        bytesCopied: acc.bytes,
      })
    } catch (e) {
      targets.push({
        ...t,
        present: true,
        filesCopied: acc.copied,
        filesSkipped: acc.skipped,
        bytesCopied: acc.bytes,
        error: String(e),
      })
    }
  }

  return {
    archiveDir: ARCHIVE_DIR,
    targets,
    filesCopied: targets.reduce((s, t) => s + t.filesCopied, 0),
    filesSkipped: targets.reduce((s, t) => s + t.filesSkipped, 0),
    bytesCopied: targets.reduce((s, t) => s + t.bytesCopied, 0),
    archiveBytes: await dirSize(ARCHIVE_DIR),
    durationMs: Date.now() - started,
  }
}
