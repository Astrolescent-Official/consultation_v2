import {
  Result,
  useAtom,
  useAtomRefresh,
  useAtomValue
} from '@effect-atom/atom-react'
import { Option } from 'effect'
import { LoaderIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TemperatureCheckId } from 'shared/governance/brandedTypes'
import type { MajorityJudgmentElectionId } from 'shared/governance/index'
import { calculateTemperatureCheckOutcome } from 'shared/governance/index'
import type { TemperatureCheck } from 'shared/governance/schemas'
import { recordTemperatureCheckOutcomeAtom } from '@/atom/adminAtom'
import { voteResultsAtom } from '@/atom/voteResultsAtom'
import { Button } from '@/components/ui/button'

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
  const weightedResultsAtom =
    voteResultsAtom('temperature_check')(temperatureCheckId)
  const voteResults = useAtomValue(weightedResultsAtom)
  const refreshVoteResults = useAtomRefresh(weightedResultsAtom)
  const calculated =
    Result.isSuccess(voteResults) && voteResults.value.cacheAvailable
      ? calculateTemperatureCheckOutcome({
          results: voteResults.value.results,
          quorumXrd,
          approvalThreshold
        })
      : undefined
  const calculatedPassed = calculated?.calculatedPassed === true

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

  if (Result.isFailure(voteResults)) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
        <span>The verified weighted result could not be loaded.</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={refreshVoteResults}
        >
          Try again
        </Button>
      </div>
    )
  }

  if (
    calculated === undefined &&
    Result.isSuccess(voteResults) &&
    !voteResults.value.cacheAvailable
  ) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          Weighted votes are still being indexed; recording is disabled.
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={refreshVoteResults}
        >
          Check again
        </Button>
      </div>
    )
  }

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
