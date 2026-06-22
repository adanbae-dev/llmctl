import { NextResponse } from 'next/server'
import { readMeta, setMeta, type SessionMeta } from '@/lib/meta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Reject browser cross-origin mutating requests (local-app CSRF guard).
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.get('host')
  } catch {
    return false
  }
}

export async function GET() {
  return NextResponse.json({ meta: await readMeta() })
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'cross-origin request denied' }, { status: 403 })
  const body = (await req.json().catch(() => null)) as
    | { id?: unknown; favorite?: unknown; tags?: unknown; note?: unknown }
    | null
  if (!body || typeof body.id !== 'string')
    return NextResponse.json({ error: 'bad request' }, { status: 400 })

  const patch: Partial<SessionMeta> = {}
  if (body.favorite !== undefined) patch.favorite = !!body.favorite
  if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t)) : []
  if (body.note !== undefined) patch.note = String(body.note)

  try {
    const meta = await setMeta(body.id, patch)
    return NextResponse.json({ ok: true, meta })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
