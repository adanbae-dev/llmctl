import { NextResponse } from 'next/server'
import { getAdapter } from '@/lib/adapters'
import { decodeId, allowedRoots, isWithin } from '@/lib/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Incremental tail of one active session: returns messages appended past
// `offset` plus the new byte offset (and, for Codex, cumulative token usage).
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const provider = sp.get('provider') ?? ''
  const id = sp.get('id') ?? ''
  const offsetRaw = Number(sp.get('offset') ?? '0')
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0

  const adapter = getAdapter(provider)
  if (!adapter)
    return NextResponse.json(
      { error: 'unknown provider', messages: [], nextOffset: offset },
      { status: 400 },
    )

  let filePath: string
  try {
    filePath = decodeId(id)
  } catch {
    return NextResponse.json({ error: 'bad id', messages: [], nextOffset: offset }, { status: 400 })
  }
  // Path-traversal guard: the locator must resolve under this provider's roots.
  if (!allowedRoots(adapter.id).some((root) => isWithin(root, filePath)))
    return NextResponse.json(
      { error: 'forbidden', messages: [], nextOffset: offset },
      { status: 403 },
    )

  try {
    const res = await adapter.tail(filePath, offset)
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json({ error: String(e), messages: [], nextOffset: offset }, { status: 500 })
  }
}
