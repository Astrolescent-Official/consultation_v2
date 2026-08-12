import { cn } from '@/lib/utils'

export type ItemStatus = 'upcoming' | 'active' | 'closed' | 'passed'

type StatusBadgeProps = {
  status: ItemStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-sm',
        status === 'upcoming' &&
          'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        status === 'active' &&
          'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-black',
        status === 'closed' &&
          'bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground',
        status === 'passed' && 'bg-blue-600 text-white dark:bg-blue-500'
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
