import { NextResponse } from 'next/server'
import { resolveTrashFile } from '@/lib/store'
import { getAdapter } from '@/lib/adapters'
import type { Session } from '@/lib/adapters/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mirror of the single-session route's enrichment so the preview matches a
// normal open (totals + models filled when the provider doesn't record them).
function enrich(s: Session): Session {
  if (!s.totalUsage) {
    let inp = 0
    let out = 0
    let has = false
    for (const m of s.messages) {
      if (m.usage) {
        has = true
        inp += m.usage.inputTokens ?? 0
        out += m.usage.outputTokens ?? 0
      }
    }
    if (has) s.totalUsage = { inputTokens: inp, outputTokens: out }
  }
  if (!s.modelsUsed) {
    const set = new Set<string>()
    for (const m of s.messages) if (m.model) set.add(m.model)
    if (set.size === 0 && s.model) set.add(s.model)
    s.modelsUsed = [...set]
  }
  return s
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })
  // resolveTrashFile only resolves ids present in the trash manifest and keeps
  // the result inside TRASH_DIR, so an arbitrary/unsafe id cannot escape.
  const resolved = await resolveTrashFile(id)
  if (!resolved) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const adapter = getAdapter(resolved.provider)
  if (!adapter) return NextResponse.json({ error: 'unknown provider' }, { status: 404 })
  try {
    return NextResponse.json({ session: enrich(await adapter.parse(resolved.path)) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
