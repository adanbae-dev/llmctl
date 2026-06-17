import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import { getAdapter } from '@/lib/adapters'
import { decodeId, isWithin, allowedRoots } from '@/lib/paths'
import { trashFile, addIgnore } from '@/lib/store'
import type { Provider, Session } from '@/lib/adapters/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Providers whose locator is an id (DB row / conversationId), not a filesystem path.
const NON_FILE = new Set(['cursor', 'antigravity-cli'])

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

function resolveLocator(id: string): string | null {
  try {
    return decodeId(id)
  } catch {
    return null
  }
}

// Basic CSRF guard for a local app: reject browser cross-origin mutating requests.
// Non-browser clients (curl, same-process) send no Origin header and are allowed.
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.get('host')
  } catch {
    return false
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string; id: string }> },
) {
  const { provider, id } = await params
  const adapter = getAdapter(provider)
  if (!adapter) return NextResponse.json({ error: 'unknown provider' }, { status: 404 })

  const locator = resolveLocator(id)
  if (locator === null) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  if (NON_FILE.has(provider)) {
    try {
      return NextResponse.json({ session: enrich(await adapter.parse(locator)) })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  const roots = allowedRoots(provider as Provider)
  if (!roots.some((r) => isWithin(r, locator))) {
    return NextResponse.json({ error: 'forbidden path' }, { status: 403 })
  }
  try {
    await fs.access(locator)
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  try {
    return NextResponse.json({ session: enrich(await adapter.parse(locator)) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ provider: string; id: string }> },
) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: 'cross-origin request denied' }, { status: 403 })
  const { provider, id } = await params
  if (!getAdapter(provider)) return NextResponse.json({ error: 'unknown provider' }, { status: 404 })

  const locator = resolveLocator(id)
  if (locator === null) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  // Non-file providers (shared DB / unparseable store): hide app-side, don't mutate source.
  if (NON_FILE.has(provider)) {
    try {
      await addIgnore(provider, locator)
      return NextResponse.json({ ok: true, action: 'hidden' })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  // File-based: move to ~/.llmctl/trash (recoverable), only inside the provider root.
  const roots = allowedRoots(provider as Provider)
  if (!roots.some((r) => isWithin(r, locator))) {
    return NextResponse.json({ error: 'forbidden path' }, { status: 403 })
  }
  try {
    await fs.access(locator)
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  try {
    const dest = await trashFile(provider, locator)
    return NextResponse.json({ ok: true, action: 'trashed', dest })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
