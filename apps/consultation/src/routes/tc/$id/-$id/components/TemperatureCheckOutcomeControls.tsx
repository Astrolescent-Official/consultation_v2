import { Result, useAtom, useAtomValue } from '@effect-atom/atom-react'
import BigNumber from 'bignumber.js'
import { Option } from 'effect'
import { LoaderIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TemperatureCheckId } from 'shared/governance/brandedTypes'
import type { MajorityJudgmentElectionId } from 'shared/governance/index'
import type { TemperatureCheck } from 'shared/governance/schemas'
import { recordTemperatureCheckOutcomeAtom } from '@/atom/adminAtom'
import { voteResultsAtom } from '@/atom/voteResultsAtom'
import { Button } from '@/components/ui/button'

export const calculateTemperatureCheckOutcome = (input: {
  readonly results: ReadonlyArray<{
    readonly vote: string
    readonly votePower: string
  }>
  readonly quorumXrd: string
  readonly approvalThreshold: string
}) => {
  const forPower = new BigNumber(
    input.results.find(({ vote }) => vote === 'For')?.votePower ?? '0'
  )
  const againstPower = new BigNumber(
    input.results.find(({ vote }) => vote === 'Against')?.votePower ?? '0'
  )
  const participation = forPower.plus(againstPower)
  const forShare = participation.isZero()
    ? new BigNumber(0)
    : forPower.dividedBy(participation)
  const quorumMet = participation.isGreaterThanOrEqualTo(input.quorumXrd)
  const approvalMet = forShare.isGreaterThanOrEqualTo(input.approvalThreshold)
  return { quorumMet, approvalMet, passed: quorumMet && approvalMet }
}

export function TemperatureCheckOutcomeControls({
  temperatureCheckId,
  deadline,
  outcome,
  isAdmin,
  quorumXrd,
  approvalThreshold,
  electionId
}: {
  readonly temperatureCheckId: TemperatureCheckId
  readonly deadline: Date
  readonly outcome: TemperatureCheck['outcome']
  readonly isAdmin: boolean
  readonly quorumXrd: string
  readonly approvalThreshold: string
  readonly electionId?: MajorityJudgmentElectionId
}) {
  const [result, recordOutcome] = useAtom(recordTemperatureCheckOutcomeAtom)
  const [now, setNow] = useState(Date.now)
  const voteResults = useAtomValue(
    voteResultsAtom('temperature_check')(temperatureCheckId)
  )
  const calculated = Result.isSuccess(voteResults)
    ? calculateTemperatureCheckOutcome({
        results: voteResults.value,
        quorumXrd,
        approvalThreshold
      })
    : undefined
  const calculatedPassed = calculated?.passed === true

  useEffect(() => {
    const deadlineMs = deadline.getTime()
    if (now >= deadlineMs) return
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(deadlineMs - now, 2_147_483_647)
    )
    return () => window.clearTimeout(timer)
  }, [deadline, now])

  if (Option.isSome(outcome)) {
    const consistent =
      calculated === undefined || outcome.value.passed === calculatedPassed
    return (
      <div className="space-y-1 text-xs">
        <span className="font-semibold uppercase">
          TC {outcome.value.passed ? 'passed' : 'failed'} · recorded{' '}
          {outcome.value.recordedAt.toLocaleString()}
        </span>
        {!consistent ? (
          <p className="text-destructive">
            The recorded outcome contradicts the weighted tally. The collector
            will fail this gate closed.
          </p>
        ) : null}
      </div>
    )
  }
  if (!isAdmin || now < deadline.getTime()) return null

  if (calculated === undefined) {
    return (
      <span className="text-xs text-muted-foreground">
        Loading the verified weighted result…
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        Calculated result: {calculatedPassed ? 'passed' : 'failed'} (
        {calculated.quorumMet ? 'quorum met' : 'quorum not met'},{' '}
        {calculated.approvalMet ? 'approval met' : 'approval not met'}).
      </span>
      <Button
        type="button"
        size="sm"
        variant={calculatedPassed ? 'default' : 'outline'}
        disabled={result.waiting}
        onClick={() =>
          recordOutcome({
            temperatureCheckId,
            passed: calculatedPassed,
            electionId
          })
        }
      >
        {result.waiting ? <LoaderIcon className="size-3 animate-spin" /> : null}
        Record {calculatedPassed ? 'passed' : 'failed'}
      </Button>
      {Result.isFailure(result) ? (
        <span className="text-xs text-destructive">
          Outcome could not be recorded.
        </span>
      ) : null}
    </div>
  )
}
