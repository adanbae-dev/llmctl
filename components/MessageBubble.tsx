import type { Message } from '@/lib/adapters/types'
import { relativeTime } from '@/lib/format'
import { Block } from './ContentBlock'

const ROLE_STYLES: Record<string, { label: string; cls: string }> = {
  user: { label: 'User', cls: 'border-blue-500/40 bg-blue-500/5' },
  assistant: { label: 'Assistant', cls: 'border-emerald-500/30 bg-emerald-500/5' },
  system: { label: 'System', cls: 'border-neutral-700 bg-neutral-800/30' },
  tool: { label: 'Tool', cls: 'border-cyan-500/30 bg-cyan-500/5' },
}

export function MessageBubble({ message }: { message: Message }) {
  const r = ROLE_STYLES[message.role] ?? ROLE_STYLES.system
  return (
    <div className={`rounded-lg border px-4 py-3 ${r.cls}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
        <span className="font-semibold text-neutral-200">{r.label}</span>
        {message.model && (
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono">{message.model}</span>
        )}
        {message.usage?.outputTokens != null && (
          <span className="font-mono text-neutral-500">
            ↑{message.usage.inputTokens ?? 0} ↓{message.usage.outputTokens}
          </span>
        )}
        {message.ts && <span className="ml-auto">{relativeTime(message.ts)}</span>}
      </div>
      <div className="space-y-1">
        {message.blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>
    </div>
  )
}
