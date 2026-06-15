'use client'

import { useState, type ReactNode } from 'react'
import type { ContentBlock } from '@/lib/adapters/types'
import { Markdown } from './Markdown'

function Collapsible({
  label,
  accent,
  children,
}: {
  label: string
  accent: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-1 rounded-md border border-neutral-800 bg-neutral-900/50 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${accent}`}
      >
        <span className="text-neutral-500">{open ? '▾' : '▸'}</span>
        <span className="font-mono">{label}</span>
      </button>
      {open && <div className="border-t border-neutral-800 px-3 py-2">{children}</div>}
    </div>
  )
}

export function Block({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case 'text':
      return <Markdown>{block.text}</Markdown>
    case 'thinking':
      return (
        <Collapsible label="thinking" accent="text-purple-300">
          <div className="text-neutral-400">
            <Markdown>{block.text}</Markdown>
          </div>
        </Collapsible>
      )
    case 'tool_use':
      return (
        <Collapsible label={`tool_use · ${block.name}`} accent="text-cyan-300">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-neutral-300">
            {typeof block.input === 'string' ? block.input : JSON.stringify(block.input, null, 2)}
          </pre>
        </Collapsible>
      )
    case 'tool_result':
      return (
        <Collapsible
          label={block.isError ? 'tool_result · error' : 'tool_result'}
          accent={block.isError ? 'text-red-300' : 'text-emerald-300'}
        >
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-neutral-300">
            {block.output}
          </pre>
        </Collapsible>
      )
    default:
      return null
  }
}
