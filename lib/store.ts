import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { ROOTS, isWithin } from './paths'
import type { Provider } from './adapters/types'

const LLMCTL_DIR = path.join(os.homedir(), '.llmctl')
const TRASH_DIR = path.join(LLMCTL_DIR, 'trash')
const CONFIG_PATH = path.join(LLMCTL_DIR, 'config.json')
const MANIFEST_PATH = path.join(TRASH_DIR, 'trash.json')

interface Config {
  ignore?: Record<string, string[]>
}

async function readConfig(): Promise<Config> {
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'))
  } catch {
    return {}
  }
}

async function writeConfig(c: Config): Promise<void> {
  await fs.mkdir(LLMCTL_DIR, { recursive: true })
  await fs.writeFile(CONFIG_PATH, JSON.stringify(c, null, 2))
}

interface TrashEntry {
  id: string // trash filename, unique
  provider: string
  originalPath: string
  name: string
  deletedAt: number
  size?: number
}

async function readManifest(): Promise<TrashEntry[]> {
  try {
    const j = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'))
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}

async function writeManifest(entries: TrashEntry[]): Promise<void> {
  await fs.mkdir(TRASH_DIR, { recursive: true })
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(entries, null, 2))
}

/** Move a session file to ~/.llmctl/trash/<provider>/ and record its origin so
 *  it can later be restored to the exact same path (recoverable, not hard-deleted). */
export async function trashFile(provider: string, filePath: string): Promise<string> {
  const dir = path.join(TRASH_DIR, provider)
  await fs.mkdir(dir, { recursive: true })
  const id = `${Date.now()}-${path.basename(filePath)}`
  const dest = path.join(dir, id)
  let size: number | undefined
  try {
    size = (await fs.stat(filePath)).size
  } catch {
    // ignore
  }
  try {
    await fs.rename(filePath, dest)
  } catch {
    await fs.copyFile(filePath, dest)
    await fs.unlink(filePath)
  }
  const entries = await readManifest()
  entries.push({
    id,
    provider,
    originalPath: filePath,
    name: path.basename(filePath),
    deletedAt: Date.now(),
    size,
  })
  await writeManifest(entries)
  return dest
}

export interface TrashItem {
  kind: 'file' | 'hidden'
  id: string
  provider: string
  name: string
  deletedAt?: number
  size?: number
  restorable: boolean
}

/** List recoverable items: trashed files (from manifest) + hidden DB sessions. */
export async function listTrash(): Promise<TrashItem[]> {
  const items: TrashItem[] = []
  for (const e of await readManifest()) {
    try {
      await fs.access(path.join(TRASH_DIR, e.provider, e.id))
    } catch {
      continue // underlying file gone
    }
    items.push({
      kind: 'file',
      id: e.id,
      provider: e.provider,
      name: e.name || e.id,
      deletedAt: e.deletedAt,
      size: e.size,
      restorable: Boolean(e.originalPath),
    })
  }
  const cfg = await readConfig()
  for (const [provider, ids] of Object.entries(cfg.ignore ?? {})) {
    for (const id of ids) items.push({ kind: 'hidden', id, provider, name: id, restorable: true })
  }
  items.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  return items
}

/** Restore a trashed file to its original location (never clobbers, stays in-root). */
export async function restoreTrash(id: string): Promise<string> {
  const entries = await readManifest()
  const e = entries.find((x) => x.id === id)
  if (!e) throw new Error('not found in trash')
  if (!e.originalPath) throw new Error('no original path recorded')
  const root = ROOTS[e.provider as Provider]
  if (!root || !isWithin(root, e.originalPath)) throw new Error('unsafe restore target')
  let exists = false
  try {
    await fs.access(e.originalPath)
    exists = true
  } catch {
    exists = false
  }
  if (exists) throw new Error('a file already exists at the original location')
  await fs.mkdir(path.dirname(e.originalPath), { recursive: true })
  await fs.rename(path.join(TRASH_DIR, e.provider, e.id), e.originalPath)
  await writeManifest(entries.filter((x) => x.id !== id))
  return e.originalPath
}

/** Permanently delete a trashed file. */
export async function purgeTrash(id: string): Promise<void> {
  const entries = await readManifest()
  const e = entries.find((x) => x.id === id)
  if (e) {
    try {
      await fs.unlink(path.join(TRASH_DIR, e.provider, e.id))
    } catch {
      // ignore
    }
  }
  await writeManifest(entries.filter((x) => x.id !== id))
}

/** Non-file providers (shared DBs / unparseable stores) are hidden app-side, not deleted. */
export async function getIgnore(provider: string): Promise<Set<string>> {
  const c = await readConfig()
  return new Set(c.ignore?.[provider] ?? [])
}

export async function addIgnore(provider: string, id: string): Promise<void> {
  const c = await readConfig()
  const cur = new Set(c.ignore?.[provider] ?? [])
  cur.add(id)
  c.ignore = { ...(c.ignore ?? {}), [provider]: [...cur] }
  await writeConfig(c)
}

/** Un-hide a DB-backed session (reverse of addIgnore). */
export async function removeIgnore(provider: string, id: string): Promise<void> {
  const c = await readConfig()
  const cur = new Set(c.ignore?.[provider] ?? [])
  cur.delete(id)
  c.ignore = { ...(c.ignore ?? {}), [provider]: [...cur] }
  await writeConfig(c)
}
