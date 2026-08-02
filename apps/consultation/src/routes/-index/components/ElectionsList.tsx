import { Result, useAtomValue } from '@effect-atom/atom-react'
import { Link } from '@tanstack/react-router'
import { Cause, Option } from 'effect'
import { majorityJudgmentElectionsAtom } from '@/atom/majorityJudgmentAtom'
import type { SortOrder } from '@/atom/proposalsAtom'
import { Card } from '@/components/ui/card'
import { InlineCode } from '@/components/ui/typography'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { formatDateRange } from '@/lib/utils'
import { CardSkeletonList } from './CardSkeleton'
import { getItemStatus, StatusBadge } from './StatusBadge'

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

export const electionDates = (election: {
  readonly tcVotingStart: Date
  readonly tcVotingEnd: Date
  readonly roundOne: Option.Option<{ readonly deadline: Date }>
  readonly rerun: Option.Option<{ readonly deadline: Date }>
}) => {
  const round = Option.orElse(election.rerun, () => election.roundOne)
  return {
    start: election.tcVotingStart,
    deadline: Option.match(round, {
      onNone: () => election.tcVotingEnd,
      onSome: ({ deadline }) => deadline
    })
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
              Majority Judgment elections appear here as soon as their
              candidate-list Temperature Check is created.
            </p>
          </div>
        )
      }

      return (
        <div className="flex flex-col gap-4">
          {visible.map((election) => {
            const dates = electionDates(election)
            const status = getItemStatus(dates.start, dates.deadline)
            return (
              <Link
                key={election.id}
                to="/election/$id"
                params={{ id: String(election.id) }}
                className="group block"
              >
                <Card className="p-6 transition-colors group-hover:border-neutral-400 dark:group-hover:border-neutral-600">
                  <div className="flex flex-col gap-5 sm:flex-row sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge status={status} />
                        <span className="font-mono text-xs text-neutral-500">
                          Election #{election.id}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {election.seatCount}{' '}
                          {election.seatCount === 1 ? 'seat' : 'seats'} · Role{' '}
                          {election.roleId}
                        </span>
                        {election.hidden ? (
                          <span className="bg-yellow-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
                            Hidden
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-xl font-medium text-neutral-900 decoration-neutral-400 underline-offset-4 group-hover:underline dark:text-neutral-100">
                        {election.title}
                      </h3>
                      <p className="line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">
                        {election.shortDescription}
                      </p>
                      <p className="pt-2 text-xs text-neutral-500">
                        {formatDateRange(dates.start, dates.deadline)}
                      </p>
                    </div>
                    <div className="border-t border-neutral-100 pt-4 text-xs text-muted-foreground sm:border-t-0 sm:border-l sm:pl-6 sm:pt-0 dark:border-neutral-800">
                      <div className="mb-1 uppercase tracking-wider">
                        Parameters
                      </div>
                      <div className="font-mono">
                        {election.parameterSet.id} v
                        {election.parameterSet.version}
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )
    })
    .render()
}
