import { NextResponse } from 'next/server'
import { listTrash, restoreTrash, purgeTrash, removeIgnore } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Basic CSRF guard for a local app: reject browser cross-origin mutating requests.
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
  try {
    return NextResponse.json({ items: await listTrash() })
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: 'cross-origin request denied' }, { status: 403 })
  let body: { action?: string; id?: string; provider?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad body' }, { status: 400 })
  }
  const { action, id, provider } = body
  if (!action || !id) return NextResponse.json({ error: 'missing action/id' }, { status: 400 })
  try {
    if (action === 'restore') return NextResponse.json({ ok: true, restored: await restoreTrash(id) })
    if (action === 'purge') {
      await purgeTrash(id)
      return NextResponse.json({ ok: true })
    }
    if (action === 'unhide') {
      if (!provider) return NextResponse.json({ error: 'missing provider' }, { status: 400 })
      await removeIgnore(provider, id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
