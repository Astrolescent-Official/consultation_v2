import { Link } from '@tanstack/react-router'
import type { EntityType } from 'shared/governance/brandedTypes'
import { EntityId } from 'shared/governance/brandedTypes'
import { AddressLink } from '@/components/AddressLink'
import { Card } from '@/components/ui/card'
import { formatDateRange } from '@/lib/utils'
import { EndingSoonBadge } from './EndingSoonBadge'
import { QuorumProgress } from './QuorumProgress'
import type { ItemStatus } from './StatusBadge'
import { getItemStatus, StatusBadge } from './StatusBadge'

type ItemCardProps = {
  id: number
  title: string
  shortDescription: string
  author: string
  start: Date
  deadline: Date
  quorum: number
  linkPrefix: '/tc' | '/proposal'
  hidden?: boolean
  contextLabel?: string
}

export function ItemCard({
  id,
  title,
  shortDescription,
  author,
  start,
  deadline,
  quorum,
  linkPrefix,
  hidden,
  contextLabel
}: ItemCardProps) {
  const status: ItemStatus = getItemStatus(start, deadline)
  const isActive = status === 'active'
  const typeLabel = linkPrefix === '/tc' ? 'TC' : 'GP'
  const entityType: EntityType =
    linkPrefix === '/tc' ? 'temperature_check' : 'proposal'
  const entityId = EntityId.make(id)

  return (
    <Link
      to={`${linkPrefix}/$id`}
      params={{ id: String(id) }}
      className="block group"
    >
      <Card className="hover:border-rule-strong transition-colors p-6">
        <div className="flex flex-col sm:flex-row justify-between gap-6">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-3">
              <StatusBadge status={status} />
              <span className="text-xs text-muted-foreground font-mono">
                {typeLabel} #{id}
              </span>
              {isActive && <EndingSoonBadge deadline={deadline} />}
              {contextLabel ? (
                <span className="rounded-sm bg-muted px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                  {contextLabel}
                </span>
              ) : null}
              {hidden && (
                <span className="rounded-sm bg-pending px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-[0.09em] text-pending-foreground">
                  Hidden
                </span>
              )}
            </div>

            <h3 className="text-xl font-medium text-foreground group-hover:underline decoration-muted-foreground underline-offset-4">
              {title}
            </h3>

            <p className="text-muted-foreground text-sm line-clamp-2">
              {shortDescription}
            </p>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center text-xs text-muted-foreground gap-1 sm:gap-4">
              <span>
                By <AddressLink address={author} />
              </span>
              <span className="hidden sm:inline">&middot;</span>
              <span className="font-mono">
                {formatDateRange(start, deadline)}
              </span>
            </div>
          </div>

          {/* Mini Stats */}
          <div className="sm:w-48 flex sm:flex-col justify-between sm:justify-center sm:items-center gap-4 border-t sm:border-t-0 sm:border-l border-border pt-4 sm:pt-0 sm:pl-6">
            <QuorumProgress
              entityType={entityType}
              entityId={entityId}
              quorum={quorum}
              isActive={isActive}
            />
          </div>
        </div>
      </Card>
    </Link>
  )
}
