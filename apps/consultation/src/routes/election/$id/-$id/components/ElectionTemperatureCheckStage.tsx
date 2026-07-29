import { Option } from 'effect'
import { TemperatureCheckId } from 'shared/governance/brandedTypes'
import type { MajorityJudgmentElectionStatus } from 'shared/governance/index'
import { AccountVotesSection } from '@/components/detail/AccountVotesSection'
import { VoteResultsSection } from '@/components/detail/VoteResultsSection'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { TC_VOTE_OPTIONS } from '@/lib/voting'
import { TemperatureCheckOutcomeControls } from '@/routes/tc/$id/-$id/components/TemperatureCheckOutcomeControls'
import { ElectionTemperatureCheckBallot } from './ElectionTemperatureCheckBallot'

export function ElectionTemperatureCheckStage({
  temperatureCheckId,
  status,
  tcVotingEnd,
  tcOutcome,
  tcOutcomeRecordedAt,
  result
}: {
  readonly temperatureCheckId: number
  readonly status: MajorityJudgmentElectionStatus
  readonly tcVotingEnd: Date
  readonly tcOutcome: 'PENDING' | 'PASSED' | 'FAILED'
  readonly tcOutcomeRecordedAt: Date | null
  readonly result: {
    readonly forVotingPower: string
    readonly againstVotingPower: string
    readonly participationXrd: string
    readonly quorumXrd: string
    readonly quorumMet: boolean
    readonly forShare: string
    readonly approvalMet: boolean
    readonly passed: boolean | null
  }
}) {
  const id = TemperatureCheckId.make(temperatureCheckId)
  const isAdmin = useIsAdmin()

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

  const votingOpen = status === 'TC_LIVE' && Date.now() < tcVotingEnd.getTime()
  const showTallies = status !== 'PENDING' && status !== 'MJ_PENDING'

  return (
    <section className="mx-auto max-w-5xl space-y-4 rounded-md border p-5">
      <div>
        <h2 className="text-xl font-medium">Candidate-list approval</h2>
        <p className="text-sm text-muted-foreground">
          Vote For or Against the list as a whole. Individual candidate concerns
          are expressed with grades during the MJ stage.
        </p>
      </div>
      {showTallies ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">For / Against</dt>
            <dd>
              {result.forVotingPower} / {result.againstVotingPower} XRD
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Fixed quorum</dt>
            <dd>
              {result.participationXrd} / {result.quorumXrd} XRD ·{' '}
              {result.quorumMet ? 'met' : 'not met'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">For share</dt>
            <dd>
              {new Intl.NumberFormat(undefined, {
                style: 'percent',
                maximumFractionDigits: 2
              }).format(Number(result.forShare))}{' '}
              · {result.approvalMet ? 'approval met' : 'approval not met'}
              {result.passed === null
                ? ''
                : result.passed
                  ? ' · passed'
                  : ' · failed'}
            </dd>
          </div>
        </dl>
      ) : null}
      <TemperatureCheckOutcomeControls
        temperatureCheckId={id}
        deadline={tcVotingEnd}
        outcome={outcome}
        isAdmin={isAdmin}
      />
      {votingOpen ? (
        <ElectionTemperatureCheckBallot temperatureCheckId={id} />
      ) : null}
      {status === 'TC_LIVE' || status === 'TC_FAILED' ? (
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
      ) : null}
      {status === 'TC_LIVE' && !votingOpen ? (
        <p className="text-sm text-muted-foreground">
          Candidate-list voting has closed. The verified weighted outcome has
          not been recorded yet.
        </p>
      ) : null}
    </section>
  )
}
