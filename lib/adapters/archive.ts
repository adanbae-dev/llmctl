import path from 'node:path'
import { ROOTS, ARCHIVE_ROOTS } from '../paths'
import type { Provider, SessionSummary } from './types'

/**
 * Discover sessions from a provider's live root plus, when present, its backup
 * archive (~/.llmctl/archive). Sessions found only in the archive — i.e. deleted
 * from the live root after a backup — are flagged `archived: true`. Dedup is by
 * path relative to each root, with the live copy always taking precedence.
 */
export async function discoverWithArchive(
  provider: Provider,
  scan: (root: string) => Promise<SessionSummary[]>,
): Promise<SessionSummary[]> {
  const liveRoot = ROOTS[provider]
  const live = liveRoot ? await scan(liveRoot) : []
  const archiveRoot = ARCHIVE_ROOTS[provider]
  if (!archiveRoot) return live
  const seen = new Set(live.map((s) => path.relative(liveRoot, s.filePath)))
  for (const s of await scan(archiveRoot)) {
    const rel = path.relative(archiveRoot, s.filePath)
    if (seen.has(rel)) continue
    seen.add(rel)
    live.push({ ...s, archived: true })
  }
  return live
}
