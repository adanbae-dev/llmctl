'use client'

import { useEffect, useMemo, useState } from 'react'
import { ProviderTabs, type TabStatus } from '@/components/ProviderTabs'
import { SessionSidebar } from '@/components/SessionSidebar'
import { ConversationView } from '@/components/ConversationView'
import { UsageDashboard } from '@/components/UsageDashboard'
import type { Provider, ProviderStatus, Session, SessionSummary } from '@/lib/adapters/types'

export default function Home() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [statuses, setStatuses] = useState<Record<string, TabStatus>>({})
  const [active, setActive] = useState<Provider>('claude')
  const [selected, setSelected] = useState<SessionSummary | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(false)
  const [view, setView] = useState<'sessions' | 'usage'>('sessions')
  const [trashPreview, setTrashPreview] = useState(false)

  useEffect(() => {
    fetch('/api/providers')
      .then((r) => r.json())
      .then((d) => {
        const list: ProviderStatus[] = d.providers ?? []
        const map: Record<string, TabStatus> = {}
        for (const p of list) map[p.id] = { installed: p.installed, version: p.version }
        setStatuses(map)
        const firstInstalled = list.find((p) => p.installed)?.id as Provider | undefined
        if (firstInstalled) setActive((prev) => (map[prev]?.installed ? prev : firstInstalled))
      })
      .catch(() => {})
  }, [])

  function loadSessions() {
    setLoadingList(true)
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => {})
      .finally(() => setLoadingList(false))
  }

  useEffect(() => {
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of sessions) c[s.provider] = (c[s.provider] ?? 0) + 1
    return c
  }, [sessions])

  const visible = useMemo(() => sessions.filter((s) => s.provider === active), [sessions, active])

  function onTab(p: Provider) {
    setActive(p)
    setSelected(null)
    setSession(null)
    setTrashPreview(false)
  }

  async function onSelect(s: SessionSummary) {
    setSelected(s)
    setTrashPreview(false)
    setSession(null)
    setLoadingSession(true)
    try {
      const r = await fetch(`/api/sessions/${s.provider}/${encodeURIComponent(s.id)}`)
      const d = await r.json()
      setSession(d.session ?? null)
    } catch {
      setSession(null)
    } finally {
      setLoadingSession(false)
    }
  }

  async function onDelete(s: SessionSummary) {
    const msg =
      s.provider === 'cursor'
        ? `이 Cursor 세션을 목록에서 숨길까요? (Cursor DB는 변경되지 않습니다)\n\n${s.title}`
        : `이 세션을 휴지통(~/.llmctl/trash)으로 옮길까요?\n\n${s.title}`
    if (!window.confirm(msg)) return
    try {
      const r = await fetch(`/api/sessions/${s.provider}/${encodeURIComponent(s.id)}`, {
        method: 'DELETE',
      })
      if (!r.ok) throw new Error('delete failed')
      setSessions((prev) => prev.filter((x) => x.id !== s.id))
      if (selected?.id === s.id) {
        setSelected(null)
        setSession(null)
      }
    } catch {
      window.alert('삭제에 실패했습니다.')
    }
  }

  async function onViewTrash(item: { id: string }) {
    setSelected(null)
    setSession(null)
    setTrashPreview(true)
    setLoadingSession(true)
    try {
      const r = await fetch(`/api/trash/view?id=${encodeURIComponent(item.id)}`)
      const d = await r.json()
      setSession(d.session ?? null)
    } catch {
      setSession(null)
    } finally {
      setLoadingSession(false)
    }
  }

  const tabBtn = (v: 'sessions' | 'usage') =>
    `rounded px-3 py-1 text-xs font-medium ${
      view === v ? 'bg-surface-2 text-fg-strong' : 'text-fg-subtle hover:text-fg-muted'
    }`

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-bg px-3 py-1.5">
        <span className="text-xs font-semibold text-fg-strong">llmctl</span>
        <span className="mr-1 hidden text-2xs text-fg-faint sm:inline">로컬 LLM 세션·사용량 뷰어</span>
        <button type="button" onClick={() => setView('sessions')} className={tabBtn('sessions')}>
          💬 세션
        </button>
        <button type="button" onClick={() => setView('usage')} className={tabBtn('usage')}>
          📊 사용량
        </button>
      </div>

      {view === 'usage' ? (
        <div className="flex-1 overflow-y-auto">
          <UsageDashboard />
        </div>
      ) : (
        <>
          <ProviderTabs active={active} statuses={statuses} counts={counts} onChange={onTab} />
          <div className="flex flex-1 overflow-hidden">
            <SessionSidebar
              sessions={visible}
              loading={loadingList}
              selectedId={selected?.id ?? null}
              onSelect={onSelect}
              onDelete={onDelete}
              onRestored={loadSessions}
              onViewTrash={onViewTrash}
            />
            <div className="flex flex-1 flex-col overflow-hidden">
              {trashPreview && (
                <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-300">
                  🗑 휴지통 미리보기 · 읽기 전용 (복원하면 원래 위치로 돌아갑니다)
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <ConversationView
                  session={session}
                  loading={loadingSession}
                  hasSelection={!!selected || trashPreview}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
