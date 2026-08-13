import { Clock } from 'lucide-react'

type EndingSoonBadgeProps = {
  deadline: Date
}

export function EndingSoonBadge({ deadline }: EndingSoonBadgeProps) {
  if (!isEndingSoon(deadline)) {
    return null
  }

  const hoursLeft = Math.ceil(
    (deadline.getTime() - Date.now()) / (1000 * 60 * 60)
  )

  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-pending px-2.5 py-0.5 font-mono text-xs font-medium text-pending-foreground">
      <Clock className="size-3" />
      {hoursLeft <= 1 ? 'Ending soon' : `${hoursLeft}h left`}
    </span>
  )
}

export function isEndingSoon(deadline: Date): boolean {
  const now = new Date()
  const hoursUntilDeadline =
    (deadline.getTime() - now.getTime()) / (1000 * 60 * 60)
  return hoursUntilDeadline > 0 && hoursUntilDeadline <= 24
}
