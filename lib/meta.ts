// Per-session user metadata (favorite / tags / note), persisted to a small
// JSON manifest at ~/.llmctl/meta.json — same approach as the trash manifest in
// store.ts. Keyed by the session id (the same base64url locator the viewer
// uses). Read-only w.r.t. the original session logs.

import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const LLMCTL_DIR = path.join(os.homedir(), '.llmctl')
const META_PATH = path.join(LLMCTL_DIR, 'meta.json')

export interface SessionMeta {
  favorite?: boolean
  tags?: string[]
  note?: string
  updatedAt?: number // epoch ms
}
export type MetaMap = Record<string, SessionMeta>

export async function readMeta(): Promise<MetaMap> {
  try {
    const j = JSON.parse(await fs.readFile(META_PATH, 'utf8'))
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as MetaMap) : {}
  } catch {
    return {}
  }
}

async function writeMeta(m: MetaMap): Promise<void> {
  await fs.mkdir(LLMCTL_DIR, { recursive: true })
  await fs.writeFile(META_PATH, JSON.stringify(m, null, 2))
}

const isEmpty = (m: SessionMeta) => !m.favorite && !m.note && (!m.tags || m.tags.length === 0)

/** Merge a patch into one session's metadata. Empties are pruned so the
 *  manifest only ever holds sessions the user actually annotated. */
export async function setMeta(id: string, patch: Partial<SessionMeta>): Promise<SessionMeta> {
  const all = await readMeta()
  const next: SessionMeta = { ...(all[id] ?? {}), ...patch, updatedAt: Date.now() }
  if (next.tags) next.tags = [...new Set(next.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20)
  if (next.note) next.note = next.note.slice(0, 4000)
  else delete next.note
  if (!next.favorite) delete next.favorite
  if (!next.tags || next.tags.length === 0) delete next.tags

  if (isEmpty(next)) {
    delete all[id]
    await writeMeta(all)
    return {}
  }
  all[id] = next
  await writeMeta(all)
  return next
}
