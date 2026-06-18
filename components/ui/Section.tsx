import type { ReactNode } from 'react'

/** Section container = the single elevation level (no card-in-card).
 *  Optional header (title / description / actions). Token-based. */
export function Section({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-section border border-border bg-surface p-4 ${className}`}>
      {(title || description || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          {(title || description) && (
            <div>
              {title && <h2 className="text-sm font-medium text-fg-muted">{title}</h2>}
              {description && <p className="mt-0.5 text-2xs text-fg-faint">{description}</p>}
            </div>
          )}
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
