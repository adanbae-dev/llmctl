import type { ReactNode } from 'react'

/** Empty state with a single next action — never a dead end. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && <div className="text-2xl opacity-60">{icon}</div>}
      <p className="text-sm text-fg-muted">{title}</p>
      {description && <p className="max-w-sm text-2xs text-fg-faint">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
