import { Result, useAtom } from '@effect-atom/atom-react'
import { Option } from 'effect'
import { LoaderIcon } from 'lucide-react'
import type { TemperatureCheckId } from 'shared/governance/brandedTypes'
import type { TemperatureCheck } from 'shared/governance/schemas'
import { recordTemperatureCheckOutcomeAtom } from '@/atom/adminAtom'
import { Button } from '@/components/ui/button'

export function TemperatureCheckOutcomeControls({
  temperatureCheckId,
  deadline,
  outcome,
  isAdmin
}: {
  readonly temperatureCheckId: TemperatureCheckId
  readonly deadline: Date
  readonly outcome: TemperatureCheck['outcome']
  readonly isAdmin: boolean
}) {
  const [result, recordOutcome] = useAtom(recordTemperatureCheckOutcomeAtom)

  if (Option.isSome(outcome)) {
    return (
      <span className="text-xs font-semibold uppercase">
        TC {outcome.value.passed ? 'passed' : 'failed'} · recorded{' '}
        {outcome.value.recordedAt.toLocaleString()}
      </span>
    )
  }
  if (!isAdmin || Date.now() < deadline.getTime()) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        Record the verified weighted result:
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={result.waiting}
        onClick={() => recordOutcome({ temperatureCheckId, passed: false })}
      >
        {result.waiting ? <LoaderIcon className="size-3 animate-spin" /> : null}
        Failed
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={result.waiting}
        onClick={() => recordOutcome({ temperatureCheckId, passed: true })}
      >
        {result.waiting ? <LoaderIcon className="size-3 animate-spin" /> : null}
        Passed
      </Button>
      {Result.isFailure(result) ? (
        <span className="text-xs text-destructive">
          Outcome could not be recorded.
        </span>
      ) : null}
    </div>
  )
}
