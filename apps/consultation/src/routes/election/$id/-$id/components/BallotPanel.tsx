import { LoaderIcon, Vote } from 'lucide-react'
import type { ReactNode } from 'react'
import { type Grade, gradeName } from 'shared/governance/index'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Candidate } from './CandidateCard'

/**
 * Grades are chosen against each candidate in the main column; this panel is
 * the running summary of that ballot and the only place it gets submitted, so
 * the reader can always see what is about to be signed.
 */
export function BallotPanel({
  candidates,
  selectedGrades,
  votingOpen,
  submitting,
  priorBallot,
  accountsControl,
  notice,
  onSubmit
}: {
  readonly candidates: ReadonlyArray<Candidate>
  readonly selectedGrades: ReadonlyMap<number, Grade>
  readonly votingOpen: boolean
  readonly submitting: boolean
  readonly priorBallot: boolean
  readonly accountsControl?: ReactNode
  readonly notice?: ReactNode
  readonly onSubmit: () => void
}) {
  const remaining = candidates.filter(
    (candidate) => !selectedGrades.has(candidate.id)
  ).length

  if (!votingOpen && !priorBallot) {
    return (
      <div className="border border-border bg-secondary/50 p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          Your ballot
        </h3>
        <div className="py-6 text-center">
          <Vote className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Grading is not open. Ballots can only be cast while a round is live.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border bg-secondary/50 p-6">
      <h3 className="mb-4 text-sm font-semibold text-foreground">
        {votingOpen ? 'Your ballot' : 'Your recorded ballot'}
      </h3>

      <ul className="space-y-2">
        {candidates.map((candidate) => {
          const grade = selectedGrades.get(candidate.id)
          return (
            <li
              key={candidate.id}
              className="flex items-center justify-between gap-3 border border-border bg-background px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-foreground">
                {candidate.displayName}
              </span>
              <span
                className={cn(
                  'shrink-0 text-xs font-medium',
                  grade === undefined
                    ? 'text-muted-foreground'
                    : 'text-foreground'
                )}
              >
                {grade === undefined ? 'Not graded' : gradeName(grade)}
              </span>
            </li>
          )
        })}
      </ul>

      {votingOpen ? (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            {remaining === 0
              ? priorBallot
                ? 'This submission will replace your earlier ballot.'
                : 'Every candidate has a grade.'
              : `${remaining} ${
                  remaining === 1
                    ? 'candidate still needs'
                    : 'candidates still need'
                } a grade`}
          </p>
          {accountsControl}
          <Button
            type="button"
            onClick={onSubmit}
            disabled={remaining > 0 || submitting}
            className={cn(
              'mt-4 w-full',
              remaining === 0 &&
                !submitting &&
                'border-transparent bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-500'
            )}
          >
            {submitting ? <LoaderIcon className="size-4 animate-spin" /> : null}
            {submitting
              ? 'Submitting…'
              : priorBallot
                ? 'Replace ballot'
                : 'Submit ballot'}
          </Button>
          {notice}
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Voting is closed. This is the ballot recorded on-ledger for the
          connected account.
        </p>
      )}
    </div>
  )
}
