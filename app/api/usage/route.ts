import { NextResponse } from 'next/server'
import { scanUsage } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const provider = sp.get('provider') || 'claude'
  const scope = {
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    project: sp.get('project') || undefined,
  }
  try {
    const res = await scanUsage(provider, scope)
    const models = [...new Set(res.rows.map((r) => r.model))].sort()
    return NextResponse.json({ ...res, models, provider })
  } catch (e) {
    return NextResponse.json({ error: String(e), rows: [], tools: [], models: [] }, { status: 500 })
  }
}
