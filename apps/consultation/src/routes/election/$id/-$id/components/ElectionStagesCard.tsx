import type { ReactNode } from 'react'
import type { MajorityJudgmentElectionStatus } from 'shared/governance/index'
import { SidebarCard } from '@/components/detail/SidebarCard'
import { cn, formatDateRange } from '@/lib/utils'

type StageState = 'done' | 'current' | 'upcoming' | 'failed'

export type ElectionStage = {
  readonly label: string
  readonly detail: string
  readonly state: StageState
}

type RoundWindow = {
  readonly round: 'RoundOne' | 'Rerun'
  readonly votingStart: Date
  readonly votingEnd: Date
}

const candidateListState = (
  status: MajorityJudgmentElectionStatus
): StageState => {
  if (status === 'PENDING') return 'upcoming'
  if (status === 'TC_LIVE') return 'current'
  if (status === 'TC_FAILED') return 'failed'
  return 'done'
}

const roundOneState = (status: MajorityJudgmentElectionStatus): StageState => {
  switch (status) {
    case 'PENDING':
    case 'TC_LIVE':
    case 'MJ_PENDING':
      return 'upcoming'
    case 'TC_FAILED':
      return 'upcoming'
    case 'LIVE':
      return 'current'
    case 'ROUND_1_FAILED':
      return 'failed'
    default:
      return 'done'
  }
}

const rerunState = (status: MajorityJudgmentElectionStatus): StageState => {
  switch (status) {
    case 'RERUN_PENDING':
      return 'upcoming'
    case 'RERUN_LIVE':
      return 'current'
    case 'FAILED':
      return 'failed'
    case 'TIE_UNRESOLVED':
    case 'FINAL':
      return 'done'
    default:
      return 'upcoming'
  }
}

const resultState = (status: MajorityJudgmentElectionStatus): StageState => {
  switch (status) {
    case 'FINAL':
      return 'done'
    case 'TIE_UNRESOLVED':
      return 'current'
    case 'TC_FAILED':
    case 'ROUND_1_FAILED':
    case 'FAILED':
      return 'failed'
    default:
      return 'upcoming'
  }
}

const resultDetail = (status: MajorityJudgmentElectionStatus): string => {
  switch (status) {
    case 'FINAL':
      return 'Seats confirmed'
    case 'TIE_UNRESOLVED':
      return 'Awaiting governance adjudication'
    case 'TC_FAILED':
      return 'The candidate list was not approved'
    case 'ROUND_1_FAILED':
      return 'Round one turnout was below quorum'
    case 'FAILED':
      return 'No candidate was elected'
    default:
      return 'Published once voting closes'
  }
}

/**
 * The election runs through a candidate-list gate before any grading happens,
 * and can gain a rerun round. Laying the phases out explicitly is what tells a
 * reader which of those stages the numbers below them belong to.
 */
export function buildElectionStages({
  status,
  tcVotingStart,
  tcVotingEnd,
  rounds
}: {
  readonly status: MajorityJudgmentElectionStatus
  readonly tcVotingStart?: Date
  readonly tcVotingEnd?: Date
  readonly rounds: ReadonlyArray<RoundWindow>
}): ReadonlyArray<ElectionStage> {
  const roundOne = rounds.find(({ round }) => round === 'RoundOne')
  const rerun = rounds.find(({ round }) => round === 'Rerun')
  const window = (round?: RoundWindow) =>
    round === undefined
      ? 'Opens when the operator starts it'
      : formatDateRange(round.votingStart, round.votingEnd)

  const stages: Array<ElectionStage> = [
    {
      label: 'Candidate list',
      detail:
        tcVotingStart === undefined || tcVotingEnd === undefined
          ? 'Opens immediately on creation'
          : formatDateRange(tcVotingStart, tcVotingEnd),
      state: candidateListState(status)
    },
    {
      label: 'Round one voting',
      detail: window(roundOne),
      state: roundOneState(status)
    }
  ]

  if (rerun !== undefined || rerunState(status) !== 'upcoming') {
    stages.push({
      label: 'Round two rerun',
      detail: window(rerun),
      state: rerunState(status)
    })
  }

  stages.push({
    label: 'Result',
    detail: resultDetail(status),
    state: resultState(status)
  })

  return stages
}

const markerTone = (state: StageState) => {
  switch (state) {
    case 'done':
      return 'bg-emerald-600 dark:bg-emerald-500'
    case 'current':
      return 'bg-foreground ring-4 ring-foreground/15'
    case 'failed':
      return 'bg-neutral-400 dark:bg-neutral-600'
    case 'upcoming':
      return 'bg-border'
  }
}

export function ElectionStagesCard({
  stages,
  statusCopy,
  countdown
}: {
  readonly stages: ReadonlyArray<ElectionStage>
  readonly statusCopy: string
  readonly countdown?: ReactNode
}) {
  return (
    <SidebarCard title="Election progress">
      <p className="text-sm font-medium text-foreground">{statusCopy}</p>
      {countdown ? (
        <p className="mt-1 text-sm text-muted-foreground">{countdown}</p>
      ) : null}
      <ol className="mt-5 space-y-4">
        {stages.map((stage, index) => (
          <li key={stage.label} className="flex gap-3">
            <span className="relative flex w-2 shrink-0 justify-center">
              <span
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  markerTone(stage.state)
                )}
              />
              {index < stages.length - 1 ? (
                <span className="absolute top-5 bottom-[-1.25rem] w-px bg-border" />
              ) : null}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-sm',
                  stage.state === 'current'
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {stage.label}
              </p>
              <p className="text-xs text-muted-foreground">{stage.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </SidebarCard>
  )
}
