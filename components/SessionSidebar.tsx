'use client'

import { useMemo, useState } from 'react'
import type { SessionSummary } from '@/lib/adapters/types'
import { relativeTime, formatBytes } from '@/lib/format'

export function SessionSidebar({
  sessions,
  loading,
  selectedId,
  onSelect,
  onDelete,
}: {
  sessions: SessionSummary[]
  loading: boolean
  selectedId: string | null
  onSelect: (s: SessionSummary) => void
  onDelete: (s: SessionSummary) => void
}) {
  const [q, setQ] = useState('')
  const [showArchived, setShowArchived] = useState(true)

  const archivedCount = useMemo(() => sessions.filter((s) => s.archived).length, [sessions])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return sessions.filter((x) => {
      if (!showArchived && x.archived) return false
      if (!s) return true
      return x.title.toLowerCase().includes(s) || x.projectPath.toLowerCase().includes(s)
    })
  }, [sessions, q, showArchived])

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="border-b border-neutral-800 p-3">
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
      </div>
      <div className="flex-1 overflow-y-auto">
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
      </div>
    </aside>
  )
}
