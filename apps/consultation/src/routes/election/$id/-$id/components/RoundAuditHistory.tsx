import type { MajorityJudgmentElectionStatus } from 'shared/governance/index'
import { Card } from '@/components/ui/card'
import { gradeQuantileLabel } from '@/lib/gradeQuantile'
import { formatXrd } from '@/lib/utils'
import { electionStatusCopy } from '../electionDisplay'

export type HistoricalRound = {
  readonly round: 'RoundOne' | 'Rerun'
  readonly status: MajorityJudgmentElectionStatus
  readonly totalVotingPower: string
  readonly quorumXrd: string
  readonly quorumMet?: boolean
  readonly gradeQuantileApplied?: string
}

export function RoundAuditHistory({
  rounds
}: {
  readonly rounds: ReadonlyArray<HistoricalRound>
}) {
  return (
    <section className="space-y-4" aria-label="Round audit history">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Round audit history
        </h2>
        <p className="text-sm text-muted-foreground">
          Published tallies remain visible after a rerun opens.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {rounds.map((round) => (
          <Card key={round.round} className="gap-2 p-6 shadow-none">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {round.round === 'RoundOne' ? 'Round 1' : 'Round 2 rerun'}
            </p>
            <p className="text-sm font-medium">
              {electionStatusCopy(round.status)}
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatXrd(Number(round.totalVotingPower))} /{' '}
              {formatXrd(Number(round.quorumXrd))} XRD ·{' '}
              {round.quorumMet ? 'quorum met' : 'below quorum'}
            </p>
            {round.gradeQuantileApplied === undefined ? null : (
              <p className="text-sm text-muted-foreground">
                Grade quantile: {gradeQuantileLabel(round.gradeQuantileApplied)}
              </p>
            )}
          </Card>
        ))}
      </div>
    </section>
  )
}
