import { NextResponse } from 'next/server'
import { searchSessions } from '@/lib/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? ''
  try {
    const res = await searchSessions(q)
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json({ error: String(e), hits: [], parsed: 0, capped: false }, { status: 500 })
  }
}
