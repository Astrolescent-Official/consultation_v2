import { Option } from 'effect'
import { TemperatureCheckId } from 'shared/governance/brandedTypes'
import type {
  MajorityJudgmentElectionId,
  MajorityJudgmentElectionStatus
} from 'shared/governance/index'
import { AccountVotesSection } from '@/components/detail/AccountVotesSection'
import { VoteResultsSection } from '@/components/detail/VoteResultsSection'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useIsBeforeDeadline } from '@/hooks/useIsBeforeDeadline'
import { cn, formatXrd } from '@/lib/utils'
import { TC_VOTE_OPTIONS } from '@/lib/voting'
import { TemperatureCheckOutcomeControls } from '@/routes/tc/$id/-$id/components/TemperatureCheckOutcomeControls'

export type ElectionTemperatureCheckResult = {
  readonly tcParametersProjected: boolean
  readonly cacheAvailable: boolean
  readonly forVotingPower: string
  readonly againstVotingPower: string
  readonly participationXrd: string
  readonly quorumXrd: string
  readonly quorumMet: boolean
  readonly approvalThreshold: string
  readonly forShare: string
  readonly approvalMet: boolean
  readonly passed: boolean | null
}

const percent = (value: string) =>
  new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 2
  }).format(Number(value))

const xrd = (value: string) => `${formatXrd(Number(value))} XRD`

function Fact({
  label,
  value,
  note,
  positive
}: {
  readonly label: string
  readonly value: string
  readonly note?: string
  readonly positive?: boolean
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
      {note ? (
        <dd
          className={cn(
            'text-xs',
            positive
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground'
          )}
        >
          {note}
        </dd>
      ) : null}
    </div>
  )
}

/**
 * The candidate-list gate summary for the details column. The ballot and the
 * voter list live in the sidebar alongside every other voting control, so this
 * stays a read-only account of where the gate stands.
 */
export function ElectionTemperatureCheckStage({
  temperatureCheckId,
  electionId,
  status,
  tcVotingEnd,
  tcOutcome,
  tcOutcomeRecordedAt,
  result
}: {
  readonly temperatureCheckId: number
  readonly electionId: MajorityJudgmentElectionId
  readonly status: MajorityJudgmentElectionStatus
  readonly tcVotingEnd: Date
  readonly tcOutcome: 'PENDING' | 'PASSED' | 'FAILED'
  readonly tcOutcomeRecordedAt: Date | null
  readonly result: ElectionTemperatureCheckResult
}) {
  const id = TemperatureCheckId.make(temperatureCheckId)
  const isAdmin = useIsAdmin()
  const beforeDeadline = useIsBeforeDeadline(tcVotingEnd)

  // The D1-backed election response the caller already loaded carries the
  // same outcome/deadline data as a live Gateway fetch would, so build the
  // Option shape TemperatureCheckOutcomeControls expects from it directly
  // instead of re-fetching the temperature check from the chain.
  const outcome: Option.Option<{ passed: boolean; recordedAt: Date }> =
    tcOutcome === 'PENDING' || tcOutcomeRecordedAt === null
      ? Option.none()
      : Option.some({
          passed: tcOutcome === 'PASSED',
          recordedAt: tcOutcomeRecordedAt
        })

  const votingOpen = status === 'TC_LIVE' && beforeDeadline
  const showTallies = status !== 'PENDING'

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Candidate-list approval</CardTitle>
        <p className="text-sm text-muted-foreground">
          Vote For or Against the list as a whole. Individual candidate concerns
          are expressed with grades during the MJ stage.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {!result.tcParametersProjected ? (
          <p className="text-sm text-muted-foreground">
            Awaiting ledger projection of the candidate-list parameters.
            Recording is disabled until the fixed quorum is available.
          </p>
        ) : showTallies && result.cacheAvailable ? (
          <dl className="grid gap-5 text-sm sm:grid-cols-3">
            <Fact
              label="For / Against"
              value={`${formatXrd(Number(result.forVotingPower))} / ${xrd(
                result.againstVotingPower
              )}`}
            />
            <Fact
              label="Fixed quorum"
              value={`${formatXrd(Number(result.participationXrd))} / ${xrd(
                result.quorumXrd
              )}`}
              note={result.quorumMet ? 'Quorum met' : 'Quorum not met'}
              positive={result.quorumMet}
            />
            <Fact
              label="For share"
              value={percent(result.forShare)}
              note={result.approvalMet ? 'Approval met' : 'Approval not met'}
              positive={result.approvalMet}
            />
          </dl>
        ) : showTallies ? (
          <p className="text-sm text-muted-foreground">
            The weighted vote cache is still being indexed.
          </p>
        ) : null}
        {result.tcParametersProjected ? (
          <TemperatureCheckOutcomeControls
            temperatureCheckId={id}
            deadline={tcVotingEnd}
            outcome={outcome}
            isAdmin={isAdmin}
            quorumXrd={result.quorumXrd}
            approvalThreshold={result.approvalThreshold}
            electionId={electionId}
          />
        ) : null}
        {status === 'TC_LIVE' && !votingOpen ? (
          <p className="text-sm text-muted-foreground">
            Candidate-list voting has closed. The verified weighted outcome has
            not been recorded yet.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** Candidate-list tallies and voter list, for the election sidebar. */
export function ElectionTemperatureCheckResults({
  temperatureCheckId
}: {
  readonly temperatureCheckId: number
}) {
  const id = TemperatureCheckId.make(temperatureCheckId)
  return (
    <>
      <VoteResultsSection
        entityType="temperature_check"
        entityId={id}
        voteOptions={TC_VOTE_OPTIONS}
      />
      <AccountVotesSection
        entityType="temperature_check"
        entityId={id}
        voteOptions={TC_VOTE_OPTIONS}
      />
    </>
  )
}
