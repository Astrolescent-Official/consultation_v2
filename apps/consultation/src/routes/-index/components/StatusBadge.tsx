import { cn } from '@/lib/utils'

export type ItemStatus = 'upcoming' | 'active' | 'closed' | 'passed'

type StatusBadgeProps = {
  status: ItemStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-[0.09em] rounded-sm',
        status === 'upcoming' && 'bg-pending text-pending-foreground',
        status === 'active' && 'bg-live text-live-foreground',
        status === 'closed' && 'bg-muted text-muted-foreground',
        // Passed is a recorded outcome, not a live state: filled ink, not colour.
        status === 'passed' && 'bg-foreground text-background'
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export function getItemStatus(
  start: Date,
  deadline: Date,
  now = new Date()
): ItemStatus {
  if (now < start) return 'upcoming'
  if (now < deadline) return 'active'
  return 'closed'
}
