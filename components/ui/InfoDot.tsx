import type { ReactNode } from 'react'

/** ⓘ affordance with a hover/focus tooltip — the consistent way to attach
 *  "what this means / good-or-bad" copy and estimation/source disclosure. */
export function InfoDot({ label }: { label: ReactNode }) {
  return (
    <span className="group relative inline-flex align-middle">
      <span
        tabIndex={0}
        role="note"
        aria-label={typeof label === 'string' ? label : '설명'}
        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-border-strong text-[9px] font-medium leading-none text-fg-subtle"
      >
        i
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden w-max max-w-[260px] -translate-x-1/2 whitespace-normal rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-2xs leading-relaxed text-fg shadow-lg group-hover:block group-focus-within:block">
        {label}
      </span>
    </span>
  )
}
