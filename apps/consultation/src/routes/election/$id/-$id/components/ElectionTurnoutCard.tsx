import { type Grade, gradeName } from 'shared/governance/index'
import { SidebarCard } from '@/components/detail/SidebarCard'
import { gradeQuantileLabel } from '@/lib/gradeQuantile'
import { meetsQuorum } from '@/lib/quorum'
import { formatXrd } from '@/lib/utils'

export function ElectionTurnoutCard({
  totalVotingPower,
  quorumXrd,
  minimumMedianGrade,
  gradeQuantileApplied,
  roundLabel
}: {
  readonly totalVotingPower: string
  readonly quorumXrd: string
  readonly minimumMedianGrade: Grade
  readonly gradeQuantileApplied: string
  readonly roundLabel: string
}) {
  const total = Number(totalVotingPower)
  const quorum = Number(quorumXrd)
  const quorumMet = meetsQuorum(totalVotingPower, quorumXrd)
  const percentage =
    quorum > 0 ? Math.min(100, Math.max(0, (total / quorum) * 100)) : 0

  return (
    <SidebarCard title="Turnout">
      <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-foreground">{roundLabel}</span>
        <span className="text-muted-foreground tabular-nums">
          {formatXrd(total)} / {formatXrd(quorum)} XRD
        </span>
      </div>
      <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className="h-full bg-emerald-600 transition-all dark:bg-emerald-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {quorumMet
          ? 'Fixed quorum met'
          : `${percentage.toFixed(0)}% of the fixed quorum`}{' '}
        · XRD-equivalent voting power
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Minimum qualifying grade: {gradeName(minimumMedianGrade)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Grade quantile: {gradeQuantileLabel(gradeQuantileApplied)}
      </p>
    </SidebarCard>
  )
}
