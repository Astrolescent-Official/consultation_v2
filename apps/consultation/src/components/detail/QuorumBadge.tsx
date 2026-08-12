import { Result, useAtomValue } from '@effect-atom/atom-react'
import BigNumber from 'bignumber.js'
import type { EntityId, EntityType } from 'shared/governance/brandedTypes'
import { voteResultsAtom } from '@/atom/voteResultsAtom'
import { meetsQuorum } from '@/lib/quorum'

type QuorumBadgeProps = {
  entityType: EntityType
  entityId: EntityId
  quorum: number
}

export function QuorumBadge({
  entityType,
  entityId,
  quorum
}: QuorumBadgeProps) {
  const voteResultsResult = useAtomValue(voteResultsAtom(entityType)(entityId))

  return Result.builder(voteResultsResult)
    .onInitial(() => null)
    .onFailure(() => null)
    .onSuccess(({ cacheAvailable, results }) => {
      if (!cacheAvailable) return null
      const totalVotePower = results.reduce(
        (sum, r) => sum.plus(r.votePower),
        new BigNumber(0)
      )
      const quorumMet =
        Number.isFinite(quorum) &&
        quorum > 0 &&
        meetsQuorum(totalVotePower, quorum)
      const rawPercentage =
        !Number.isFinite(quorum) || quorum <= 0
          ? new BigNumber(0)
          : totalVotePower.dividedBy(quorum).multipliedBy(100)
      const displayPercent = quorumMet
        ? 100
        : Math.min(
            rawPercentage.integerValue(BigNumber.ROUND_FLOOR).toNumber(),
            99
          )

      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.09em] font-mono ${
            quorumMet
              ? 'bg-live text-live-foreground'
              : 'bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground'
          }`}
        >
          {quorumMet ? 'Quorum Reached' : `Quorum ${displayPercent}%`}
        </span>
      )
    })
    .render()
}
