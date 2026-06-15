'use client'

import type { Provider } from '@/lib/adapters/types'

const TABS: { id: Provider; label: string; active: string }[] = [
  { id: 'claude', label: 'Claude', active: 'border-orange-400 text-orange-300' },
  { id: 'codex', label: 'Codex / GPT', active: 'border-green-400 text-green-300' },
  { id: 'gemini', label: 'Gemini', active: 'border-blue-400 text-blue-300' },
  { id: 'cursor', label: 'Cursor', active: 'border-fuchsia-400 text-fuchsia-300' },
  { id: 'cursor-cli', label: 'Cursor CLI', active: 'border-pink-400 text-pink-300' },
  { id: 'antigravity-cli', label: 'Antigravity', active: 'border-indigo-400 text-indigo-300' },
]

export interface TabStatus {
  installed: boolean
  version?: string
}

export function ProviderTabs({
  active,
  statuses,
  counts,
  onChange,
}: {
  active: Provider
  statuses: Record<string, TabStatus>
  counts: Record<string, number>
  onChange: (p: Provider) => void
}) {
  return (
    <nav className="flex shrink-0 items-stretch overflow-x-auto border-b border-neutral-800 bg-neutral-950">
      {TABS.map((t) => {
        const st = statuses[t.id]
        const installed = st?.installed ?? false
        const isActive = installed && t.id === active
        return (
          <button
            key={t.id}
            type="button"
            disabled={!installed}
            onClick={() => installed && onChange(t.id)}
            title={installed ? (st?.version ? `${t.label} · ${st.version}` : t.label) : `${t.label} — 미설치`}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
              !installed
                ? 'cursor-not-allowed border-transparent text-neutral-700'
                : isActive
                  ? `${t.active} bg-neutral-900`
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <span className="font-medium">{t.label}</span>
            {installed ? (
              <span className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                {counts[t.id] ?? 0}
              </span>
            ) : (
              <span className="rounded-full border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-700">
                미설치
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
