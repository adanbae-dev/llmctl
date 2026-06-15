import { promises as fs } from 'node:fs'
import { ANTIGRAVITY_CLI_HISTORY, encodeId } from '../paths'
import { getIgnore } from '../store'
import type { ProviderAdapter, SessionSummary, Message } from './types'

interface HistEntry {
  display?: string
  timestamp?: number
  workspace?: string
  conversationId?: string
  type?: string
}

async function readHistory(): Promise<HistEntry[]> {
  try {
    const buf = await fs.readFile(ANTIGRAVITY_CLI_HISTORY, 'utf8')
    return buf
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as HistEntry
        } catch {
          return null
        }
      })
      .filter((x): x is HistEntry => x !== null)
  } catch {
    return []
  }
}

function titleOf(arr: HistEntry[]): string {
  return (arr.find((e) => e.display && e.display !== 'exit')?.display ?? arr[0]?.conversationId ?? '(untitled)').slice(0, 120)
}

const NOTE =
  '⚠️ Antigravity CLI는 응답을 protobuf(.pb)로 저장해 디코딩할 수 없습니다. ' +
  '아래는 history.jsonl의 사용자 프롬프트(JSON)만 표시한 것입니다.'

const discover: ProviderAdapter['discover'] = async () => {
  const entries = await readHistory()
  const byConv = new Map<string, HistEntry[]>()
  for (const e of entries) {
    if (!e.conversationId) continue
    const arr = byConv.get(e.conversationId) ?? []
    arr.push(e)
    byConv.set(e.conversationId, arr)
  }
  const out: SessionSummary[] = []
  const ignore = await getIgnore('antigravity-cli')
  for (const [cid, arr] of byConv) {
    if (ignore.has(cid)) continue
    const ts = arr.map((e) => e.timestamp ?? 0).filter(Boolean)
    out.push({
      id: encodeId(cid),
      provider: 'antigravity-cli',
      title: titleOf(arr),
      projectPath: arr[0]?.workspace ?? '(unknown)',
      filePath: cid,
      startedAt: ts.length ? new Date(Math.min(...ts)).toISOString() : undefined,
      updatedAt: ts.length ? new Date(Math.max(...ts)).toISOString() : undefined,
      messageCount: arr.length,
      model: 'antigravity (prompts only)',
    })
  }
  return out
}

const parse: ProviderAdapter['parse'] = async (conversationId) => {
  const entries = (await readHistory()).filter((e) => e.conversationId === conversationId)
  const messages: Message[] = [
    { id: 'ag-note', role: 'system', blocks: [{ kind: 'text', text: NOTE }] },
  ]
  entries.forEach((e, i) => {
    if (!e.display) return
    messages.push({
      id: `ag-${i}`,
      role: 'user',
      ts: e.timestamp ? new Date(e.timestamp).toISOString() : undefined,
      blocks: [{ kind: 'text', text: e.display }],
    })
  })
  const ts = entries.map((e) => e.timestamp ?? 0).filter(Boolean)
  return {
    id: encodeId(conversationId),
    provider: 'antigravity-cli',
    title: titleOf(entries),
    projectPath: entries[0]?.workspace ?? '(unknown)',
    filePath: conversationId,
    startedAt: ts.length ? new Date(Math.min(...ts)).toISOString() : undefined,
    updatedAt: ts.length ? new Date(Math.max(...ts)).toISOString() : undefined,
    messageCount: messages.length,
    model: 'antigravity (prompts only)',
    messages,
  }
}

const tail: ProviderAdapter['tail'] = async (conversationId) => {
  const s = await parse(conversationId)
  return { messages: s.messages, nextOffset: 0 }
}

export const antigravityCli: ProviderAdapter = {
  id: 'antigravity-cli',
  appendable: false,
  discover,
  parse,
  tail,
}
