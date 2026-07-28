import { Result, useAtomValue } from '@effect-atom/atom-react'
import { Link } from '@tanstack/react-router'
import { Cause, Option } from 'effect'
import type { MajorityJudgmentElection } from 'shared/governance/schemas'
import { majorityJudgmentElectionsAtom } from '@/atom/majorityJudgmentAtom'
import type { SortOrder } from '@/atom/proposalsAtom'
import { Card } from '@/components/ui/card'
import { InlineCode } from '@/components/ui/typography'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { formatDateRange } from '@/lib/utils'
import { CardSkeletonList } from './CardSkeleton'

type VisibleElection = {
  readonly id: number
  readonly hidden: boolean
}

export const selectVisibleElections = <T extends VisibleElection>(
  elections: ReadonlyArray<T>,
  isAdmin: boolean,
  sortOrder: SortOrder
) =>
  [...elections]
    .filter((election: T) => isAdmin || !election.hidden)
    .sort((left: T, right: T) =>
      sortOrder === 'asc' ? left.id - right.id : right.id - left.id
    )

const electionDates = (election: MajorityJudgmentElection) => {
  const round = Option.getOrElse(election.rerun, () => election.roundOne)
  return {
    start: election.reviewStart,
    deadline: round.deadline
  }
}

export function ElectionsList({
  sortOrder
}: {
  readonly sortOrder: SortOrder
}) {
  const result = useAtomValue(majorityJudgmentElectionsAtom)
  const isAdmin = useIsAdmin()

  return Result.builder(result)
    .onInitial(() => <CardSkeletonList />)
    .onFailure((error) => <InlineCode>{Cause.pretty(error)}</InlineCode>)
    .onSuccess((elections) => {
      const visible = selectVisibleElections(elections, isAdmin, sortOrder)

      if (visible.length === 0) {
        return (
          <div className="border border-dashed py-12 text-center">
            <h3 className="text-lg font-medium">No elections yet</h3>
            <p className="text-sm text-muted-foreground">
              Majority Judgment elections appear here after an eligible election
              temperature check is elevated.
            </p>
          </div>
        )
      }

      return (
        <div className="flex flex-col gap-4">
          {visible.map((election) => {
            const dates = electionDates(election)
            return (
              <Link
                key={election.id}
                to="/election/$id"
                params={{ id: String(election.id) }}
                className="group block"
              >
                <Card className="space-y-3 p-6 transition-colors group-hover:border-neutral-400 dark:group-hover:border-neutral-600">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-mono">Election #{election.id}</span>
                    <span>
                      {election.seatCount}{' '}
                      {election.seatCount === 1 ? 'seat' : 'seats'}
                    </span>
                    <span>Role {election.roleId}</span>
                    {election.hidden ? (
                      <span className="bg-yellow-100 px-2 py-0.5 font-semibold uppercase text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
                        Hidden
                      </span>
                    ) : null}
                  </div>
                  <h3 className="text-xl font-medium group-hover:underline">
                    {election.title}
                  </h3>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {election.shortDescription}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateRange(dates.start, dates.deadline)} ·{' '}
                    {election.parameterSet.id} v{election.parameterSet.version}
                  </p>
                </Card>
              </Link>
            )
          })}
        </div>
      )
    })
    .render()
}
