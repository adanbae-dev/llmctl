import { NextResponse } from 'next/server'
import { scanUsage } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const provider = new URL(req.url).searchParams.get('provider') || 'claude'
  try {
    const { rows, tools } = await scanUsage(provider)
    const models = [...new Set(rows.map((r) => r.model))].sort()
    return NextResponse.json({ rows, tools, models, provider })
  } catch (e) {
    return NextResponse.json({ error: String(e), rows: [], tools: [], models: [] }, { status: 500 })
  }
}
