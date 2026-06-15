import { NextResponse } from 'next/server'
import { discoverAll } from '@/lib/adapters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sessions = await discoverAll()
    return NextResponse.json({ sessions })
  } catch (e) {
    return NextResponse.json({ error: String(e), sessions: [] }, { status: 500 })
  }
}
