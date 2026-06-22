'use client'

import { useState } from 'react'
import type { SessionMeta } from '@/lib/meta'

/** Favorite / tags / note editor for the open session. Stateless w.r.t.
 *  persistence — every change calls onUpdate, which the parent forwards to
 *  /api/meta. Mount with a key per session so local draft state resets. */
export function MetaEditor({
  meta,
  onUpdate,
}: {
  meta?: SessionMeta
  onUpdate: (patch: Partial<SessionMeta>) => void
}) {
  const [note, setNote] = useState(meta?.note ?? '')
  const [tagDraft, setTagDraft] = useState('')
  const tags = meta?.tags ?? []
  const favorite = !!meta?.favorite

  const addTag = () => {
    const t = tagDraft.trim()
    setTagDraft('')
    if (t && !tags.includes(t)) onUpdate({ tags: [...tags, t] })
  }
  const removeTag = (t: string) => onUpdate({ tags: tags.filter((x) => x !== t) })

  return (
    <div className="border-b border-border bg-surface/40 px-6 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <button
          type="button"
          onClick={() => onUpdate({ favorite: !favorite })}
          title="즐겨찾기"
          className={`rounded px-1.5 py-0.5 transition-colors ${
            favorite ? 'text-amber-400' : 'text-fg-subtle hover:text-amber-400'
          }`}
        >
          {favorite ? '★ 즐겨찾기' : '☆ 즐겨찾기'}
        </button>
        <span className="text-fg-faint">·</span>
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-border-strong px-2 py-0.5 text-2xs text-fg-muted"
          >
            #{t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              title="태그 삭제"
              className="text-fg-faint hover:text-danger"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          onBlur={addTag}
          placeholder="+ 태그"
          aria-label="태그 추가"
          className="w-20 rounded border border-border bg-surface px-1.5 py-0.5 text-2xs text-fg-strong placeholder:text-fg-faint focus:border-brand/50 focus:outline-none"
        />
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if ((meta?.note ?? '') !== note) onUpdate({ note })
        }}
        placeholder="메모 — ~/.llmctl/meta.json 에 저장 (원본 로그는 변경되지 않습니다)"
        rows={2}
        className="mt-1.5 w-full resize-y rounded border border-border bg-surface px-2 py-1 text-2xs text-fg-muted placeholder:text-fg-faint focus:border-brand/50 focus:outline-none"
      />
    </div>
  )
}
