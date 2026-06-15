import { claude } from './claude'
import { codex } from './codex'
import { gemini } from './gemini'
import { cursor } from './cursor'
import { cursorCli } from './cursor-cli'
import { antigravityCli } from './antigravity-cli'
import type { ProviderAdapter, SessionSummary } from './types'

export const adapters: ProviderAdapter[] = [claude, codex, gemini, cursor, cursorCli, antigravityCli]

export function getAdapter(id: string): ProviderAdapter | undefined {
  return adapters.find((a) => a.id === id)
}

/** Run every adapter's discover() and merge into one list, newest first. */
export async function discoverAll(): Promise<SessionSummary[]> {
  const results = await Promise.all(
    adapters.map((a) => a.discover().catch(() => [] as SessionSummary[])),
  )
  return results.flat().sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}
