import { NextResponse } from 'next/server'
import { scanActive } from '@/lib/live'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Currently-active (recently appended) Claude/Codex sessions for the live viewer.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('windowMs')
  const w = raw != null ? Number(raw) : NaN
  try {
    const sessions = await scanActive(Number.isFinite(w) && w > 0 ? w : undefined)
    return NextResponse.json({ sessions })
  } catch (e) {
    return NextResponse.json({ error: String(e), sessions: [] }, { status: 500 })
  }
}
