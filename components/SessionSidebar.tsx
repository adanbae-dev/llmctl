'use client'

import { useMemo, useState } from 'react'
import type { SessionSummary } from '@/lib/adapters/types'
import { relativeTime, formatBytes } from '@/lib/format'

interface TrashItem {
  kind: 'file' | 'hidden'
  id: string
  provider: string
  name: string
  deletedAt?: number
  restorable: boolean
}

export function SessionSidebar({
  sessions,
  loading,
  selectedId,
  onSelect,
  onDelete,
  onRestored,
  onViewTrash,
}: {
  sessions: SessionSummary[]
  loading: boolean
  selectedId: string | null
  onSelect: (s: SessionSummary) => void
  onDelete: (s: SessionSummary) => void
  onRestored?: () => void
  onViewTrash?: (item: TrashItem) => void
}) {
  const [q, setQ] = useState('')
  const [showArchived, setShowArchived] = useState(true)
  const [trashMode, setTrashMode] = useState(false)
  const [trash, setTrash] = useState<TrashItem[]>([])
  const [trashLoading, setTrashLoading] = useState(false)

  const archivedCount = useMemo(() => sessions.filter((s) => s.archived).length, [sessions])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return sessions.filter((x) => {
      if (!showArchived && x.archived) return false
      if (!s) return true
      return x.title.toLowerCase().includes(s) || x.projectPath.toLowerCase().includes(s)
    })
  }, [sessions, q, showArchived])

  async function loadTrash() {
    setTrashLoading(true)
    try {
      const r = await fetch('/api/trash')
      const d = await r.json()
      setTrash(d.items ?? [])
    } catch {
      setTrash([])
    } finally {
      setTrashLoading(false)
    }
  }

  function toggleTrash() {
    const next = !trashMode
    setTrashMode(next)
    if (next) loadTrash()
  }

  async function act(item: TrashItem, action: 'restore' | 'purge' | 'unhide') {
    if (action === 'purge' && !window.confirm(`영구 삭제할까요? 되돌릴 수 없습니다.\n\n${item.name}`)) return
    try {
      const r = await fetch('/api/trash', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, id: item.id, provider: item.provider }),
      })
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`)
      await loadTrash()
      if (action !== 'purge') onRestored?.()
    } catch (e) {
      window.alert(`실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="border-b border-neutral-800 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium text-neutral-500">{trashMode ? '🗑 휴지통' : '세션'}</span>
          <button
            type="button"
            onClick={toggleTrash}
            className={`rounded px-2 py-0.5 text-[11px] ${
              trashMode ? 'bg-neutral-800 text-neutral-200' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {trashMode ? '← 목록' : '🗑 휴지통'}
          </button>
        </div>
        {!trashMode && (
          <>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="검색 (제목 · 프로젝트)"
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs outline-none focus:border-neutral-600"
            />
            {archivedCount > 0 && (
              <label className="mt-2 flex items-center gap-1.5 text-[11px] text-neutral-500">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="accent-amber-500"
                />
                보관본 포함 <span className="text-neutral-600">({archivedCount})</span>
              </label>
            )}
          </>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {trashMode ? (
          trashLoading ? (
            <p className="p-4 text-xs text-neutral-600">불러오는 중…</p>
          ) : trash.length === 0 ? (
            <p className="p-4 text-xs text-neutral-600">휴지통이 비어 있습니다.</p>
          ) : (
            <ul>
              {trash.map((t) => (
                <li key={`${t.provider}:${t.id}`} className="border-b border-neutral-900 px-3 py-2">
                  <div className="truncate text-xs text-neutral-300" title={t.name}>
                    {t.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-neutral-600">
                    <span className="font-mono">{t.provider}</span>
                    {t.kind === 'hidden' ? (
                      <span className="rounded bg-sky-500/15 px-1 text-sky-400">숨김</span>
                    ) : (
                      <span className="rounded bg-red-500/15 px-1 text-red-400">휴지통</span>
                    )}
                    {t.deletedAt != null && <span>{relativeTime(new Date(t.deletedAt).toISOString())}</span>}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    {t.kind === 'hidden' ? (
                      <button
                        type="button"
                        onClick={() => act(t, 'unhide')}
                        className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800"
                      >
                        숨김 해제
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onViewTrash?.(t)}
                          className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800"
                        >
                          보기
                        </button>
                        <button
                          type="button"
                          disabled={!t.restorable}
                          onClick={() => act(t, 'restore')}
                          title={t.restorable ? '원래 위치로 복원' : '원본 경로 정보 없음 (복원 불가)'}
                          className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-neutral-800 disabled:opacity-40"
                        >
                          복원
                        </button>
                        <button
                          type="button"
                          onClick={() => act(t, 'purge')}
                          className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-red-400 hover:bg-neutral-800"
                        >
                          영구삭제
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            {loading && <p className="p-4 text-xs text-neutral-600">불러오는 중…</p>}
            {!loading && filtered.length === 0 && (
              <p className="p-4 text-xs text-neutral-600">세션이 없습니다.</p>
            )}
            <ul>
              {filtered.map((s) => (
                <li key={s.id} className="group relative border-b border-neutral-900">
                  <button
                    type="button"
                    onClick={() => onSelect(s)}
                    className={`block w-full px-3 py-2 pr-8 text-left hover:bg-neutral-900 ${
                      selectedId === s.id ? 'bg-neutral-900' : ''
                    }`}
                  >
                    <div className="truncate text-xs font-medium text-neutral-200">
                      {s.title || '(untitled)'}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-neutral-500">{s.projectPath}</div>
                    <div className="mt-0.5 flex gap-2 text-[10px] text-neutral-600">
                      {s.archived && (
                        <span className="rounded bg-amber-500/15 px-1 font-medium text-amber-400">보관본</span>
                      )}
                      <span>{relativeTime(s.updatedAt)}</span>
                      {s.sizeBytes != null && <span>{formatBytes(s.sizeBytes)}</span>}
                      {s.messageCount != null && <span>{s.messageCount} msgs</span>}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(s)
                    }}
                    title={s.provider === 'cursor' ? '목록에서 숨김' : '휴지통으로 이동'}
                    className="absolute right-1.5 top-1.5 hidden rounded p-1 text-sm text-neutral-500 hover:bg-neutral-800 hover:text-red-400 group-hover:block"
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  )
}
