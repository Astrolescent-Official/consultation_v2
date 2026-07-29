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
    .onSuccess((results) => {
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
          className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
            quorumMet
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
          }`}
        >
          {quorumMet ? 'Quorum Reached' : `Quorum ${displayPercent}%`}
        </span>
      )
    })
    .render()
}
