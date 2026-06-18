import type { ReactNode } from 'react'

/** Toggle pill for chrome filters/tabs. Active state uses the brand
 *  accent (chrome), keeping data hues reserved for data viz. */
export function Pill({
  active,
  onClick,
  children,
  title,
  'aria-label': ariaLabel,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  title?: string
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      aria-label={ariaLabel}
      className={`rounded-full border px-2 py-0.5 text-2xs transition-colors ${
        active
          ? 'border-brand/50 bg-brand/10 text-brand'
          : 'border-border-strong text-fg-subtle hover:text-fg-muted'
      }`}
    >
      {children}
    </button>
  )
}
