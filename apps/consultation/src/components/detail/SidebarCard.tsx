import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The panel styling every detail-page sidebar section shares: a flat bordered
 * card with a small uppercase caption.
 */
export function SidebarCard({
  title,
  action,
  className,
  children
}: {
  readonly title?: ReactNode
  readonly action?: ReactNode
  readonly className?: string
  readonly children: ReactNode
}) {
  return (
    <div
      className={cn('bg-card border border-border p-6 shadow-sm', className)}
    >
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  )
}
