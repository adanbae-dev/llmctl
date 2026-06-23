import path from 'node:path'
import { promises as fs } from 'node:fs'
import { adapters, getAdapter } from './adapters'
import { ROOTS, encodeId, decodeClaudeDir } from './paths'
import type { Provider } from './adapters/types'

/**
 * Active-session discovery for the live usage viewer.
 *
 * "Active" = an appendable (offset-tailable) session file modified within the
 * last `windowMs`. Only Claude and Codex qualify — every other provider is
 * either a whole-file rewrite (Gemini) or a SQLite store (Cursor / Cursor-CLI /
 * Antigravity), none of which support incremental byte-offset tailing.
 *
 * The walk is stat-only (no content reads) so polling stays cheap even with a
 * large history; titles/projects are resolved by reusing the adapter's own
 * parse() for just the handful of recent files (capped to avoid re-reading a
 * huge session on every poll).
 */

export interface ActiveSession {
  id: string
  provider: Provider
  title: string
  projectPath: string
  sizeBytes: number
  updatedAt: string
}

const ACTIVE_WINDOW_MS = 5 * 60 * 1000
// Above this, skip the full parse() and fall back to a cheap path-derived label
// rather than re-reading a very large active file on every list poll.
const PARSE_CAP = 30 * 1024 * 1024

// Per-provider filename matcher for the recursive walk.
const MATCHERS: Partial<Record<Provider, (name: string) => boolean>> = {
  claude: (n) => n.endsWith('.jsonl'),
  codex: (n) => n.startsWith('rollout-') && n.endsWith('.jsonl'),
}

interface RecentFile {
  filePath: string
  mtimeMs: number
  size: number
}

async function walkRecent(
  dir: string,
  match: (name: string) => boolean,
  cutoff: number,
): Promise<RecentFile[]> {
  const out: RecentFile[] = []
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const fp = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...(await walkRecent(fp, match, cutoff)))
    } else if (e.isFile() && match(e.name)) {
      try {
        const st = await fs.stat(fp)
        if (st.mtimeMs >= cutoff) out.push({ filePath: fp, mtimeMs: st.mtimeMs, size: st.size })
      } catch {
        // unreadable — skip
      }
    }
  }
  return out
}

/** Cheap title/project when the file is too big to parse on every poll. */
function fallbackLabel(provider: Provider, filePath: string): { title: string; projectPath: string } {
  if (provider === 'claude') {
    return {
      title: path.basename(filePath, '.jsonl'),
      projectPath: decodeClaudeDir(path.basename(path.dirname(filePath))),
    }
  }
  return { title: path.basename(filePath), projectPath: '(active)' }
}

export async function scanActive(windowMs: number = ACTIVE_WINDOW_MS): Promise<ActiveSession[]> {
  const cutoff = Date.now() - windowMs
  const out: ActiveSession[] = []
  for (const a of adapters) {
    if (!a.appendable) continue // claude + codex only
    const root = ROOTS[a.id]
    const match = MATCHERS[a.id]
    if (!root || !match) continue
    const recent = await walkRecent(root, match, cutoff)
    for (const r of recent) {
      const fb = fallbackLabel(a.id, r.filePath)
      let title = fb.title
      let projectPath = fb.projectPath
      if (r.size <= PARSE_CAP) {
        try {
          const s = await a.parse(r.filePath)
          title = s.title || title
          projectPath = s.projectPath || projectPath
        } catch {
          // keep fallback label
        }
      }
      out.push({
        id: encodeId(r.filePath),
        provider: a.id,
        title,
        projectPath,
        sizeBytes: r.size,
        updatedAt: new Date(r.mtimeMs).toISOString(),
      })
    }
  }
  out.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))
  return out
}

// Re-exported for the tail route's provider lookup (keeps imports in one place).
export { getAdapter }
