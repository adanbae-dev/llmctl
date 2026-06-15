import { NextResponse } from 'next/server'
import { detectProviders } from '@/lib/adapters/detect'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json({ providers: await detectProviders() })
  } catch (e) {
    return NextResponse.json({ error: String(e), providers: [] }, { status: 500 })
  }
}
