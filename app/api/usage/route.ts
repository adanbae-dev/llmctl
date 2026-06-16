import { NextResponse } from 'next/server'
import { scanUsage } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const provider = new URL(req.url).searchParams.get('provider') || 'claude'
  try {
    const res = await scanUsage(provider)
    const models = [...new Set(res.rows.map((r) => r.model))].sort()
    return NextResponse.json({ ...res, models, provider })
  } catch (e) {
    return NextResponse.json({ error: String(e), rows: [], tools: [], models: [] }, { status: 500 })
  }
}
