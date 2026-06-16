import { NextResponse } from 'next/server'
import { runBackup } from '@/lib/backup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: 'cross-origin request denied' }, { status: 403 })
  try {
    const result = await runBackup()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
