import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const LLMCTL_DIR = path.join(os.homedir(), '.llmctl')
const TRASH_DIR = path.join(LLMCTL_DIR, 'trash')
const CONFIG_PATH = path.join(LLMCTL_DIR, 'config.json')

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

/** Move a session file to ~/.llmctl/trash/<provider>/ (recoverable, not hard-deleted). */
export async function trashFile(provider: string, filePath: string): Promise<string> {
  const dir = path.join(TRASH_DIR, provider)
  await fs.mkdir(dir, { recursive: true })
  const dest = path.join(dir, `${Date.now()}-${path.basename(filePath)}`)
  try {
    await fs.rename(filePath, dest)
  } catch {
    await fs.copyFile(filePath, dest)
    await fs.unlink(filePath)
  }
  return dest
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
