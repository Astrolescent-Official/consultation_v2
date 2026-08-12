import { Result, useAtomValue } from '@effect-atom/atom-react'
import type { EntityId, EntityType } from 'shared/governance/brandedTypes'
import { voteResultsAtom } from '@/atom/voteResultsAtom'
import { Skeleton } from '@/components/ui/skeleton'
import { formatXrd } from '@/lib/utils'

type QuorumProgressProps = {
  entityType: EntityType
  entityId: EntityId
  quorum: number
  isActive?: boolean
}

export function QuorumProgress({
  entityType,
  entityId,
  quorum,
  isActive
}: QuorumProgressProps) {
  const voteResultsResult = useAtomValue(voteResultsAtom(entityType)(entityId))

  return Result.builder(voteResultsResult)
    .onInitial(() => <QuorumProgressSkeleton />)
    .onFailure(() => (
      <div className="flex flex-row sm:flex-col gap-8 sm:gap-4">
        <div className="flex-1 sm:flex-none">
          <div className="text-xs text-muted-foreground uppercase mb-1">
            Quorum Progress
          </div>
          <div className="text-sm text-muted-foreground">--</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase mb-1">
            Votes
          </div>
          <div className="text-sm text-muted-foreground">--</div>
        </div>
      </div>
    ))
    .onSuccess(({ cacheAvailable, results }) => {
      if (!cacheAvailable) return <QuorumProgressSkeleton />
      const totalPower = results.reduce(
        (sum, r) => sum + Number(r.votePower),
        0
      )
      const quorumProgress =
        !Number.isFinite(quorum) || quorum <= 0
          ? 0
          : (totalPower / quorum) * 100

      return (
        <QuorumProgressDisplay
          quorumProgress={quorumProgress}
          totalPower={totalPower}
          isActive={isActive}
        />
      )
    })
    .render()
}

type QuorumProgressDisplayProps = {
  quorumProgress: number
  totalPower: number
  isActive?: boolean
}

function QuorumProgressSkeleton() {
  return (
    <div className="flex flex-row sm:flex-col gap-8 sm:gap-4">
      <div className="flex-1 sm:flex-none">
        <div className="text-xs text-muted-foreground uppercase mb-1">
          Quorum Progress
        </div>
        <Skeleton className="h-7 w-12 mt-0.5" />
        <Skeleton className="w-full h-1.5 mt-2" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground uppercase mb-1">
          Votes
        </div>
        <Skeleton className="h-5 w-20" />
      </div>
    </div>
  )
}

function QuorumProgressDisplay({
  quorumProgress,
  totalPower,
  isActive
}: QuorumProgressDisplayProps) {
  const quorumProgressCapped = Math.min(quorumProgress, 100)
  const isHighProgress = quorumProgress >= 100
  const displayPercent = Math.min(Math.round(quorumProgress), 100)

  return (
    <div className="flex flex-row sm:flex-col gap-8 sm:gap-4">
      {/* Quorum Progress */}
      <div className="flex-1 sm:flex-none">
        <div className="text-xs text-muted-foreground uppercase mb-1">
          Quorum Progress
        </div>
        <div
          className={`text-lg font-semibold ${isHighProgress ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {displayPercent}%
        </div>
        <div className="w-full bg-muted h-1.5 mt-2 overflow-hidden">
          <div
            className={`h-full ${isActive ? 'bg-emerald-500' : 'bg-muted-foreground'}`}
            style={{ width: `${quorumProgressCapped}%` }}
          />
        </div>
        {quorumProgress > 100 && (
          <div className="text-xs text-muted-foreground mt-1">
            Total: {Math.round(quorumProgress)}%
          </div>
        )}
      </div>

      {/* Votes - beside quorum on mobile, below on desktop */}
      <div>
        <div className="text-xs text-muted-foreground uppercase mb-1">
          Votes
        </div>
        <div className="text-sm font-mono text-foreground dark:text-muted-foreground">
          {formatXrd(totalPower)} XRD
        </div>
      </div>
    </div>
  )
}
