import type { TemperatureCheck } from 'shared/governance/schemas'
import { getTemperatureCheckResultStatus } from '@/lib/tcBallotWording'
import { getItemStatus } from '@/routes/-index/components/StatusBadge'

export function TemperatureCheckResultStatus({
  tc,
  results
}: {
  tc: TemperatureCheck
  results: ReadonlyArray<{ vote: string; votePower: string }>
}) {
  const status = getTemperatureCheckResultStatus({
    phase: getItemStatus(tc.start, tc.deadline),
    results,
    quorumXrd: tc.parameterSet.parameters.temperatureCheck.quorum,
    approvalThreshold:
      tc.parameterSet.parameters.temperatureCheck.approvalThreshold,
    outcome: tc.outcome
  })
  if (!status) return null

  return (
    <div className="mt-3 space-y-1">
      <p className="text-sm font-semibold text-foreground">{status.text}</p>
      <p className="text-xs text-muted-foreground">{status.participation}</p>
      <p className="text-xs text-muted-foreground">
        For information only. The official result is the one the RAC publishes.
      </p>
    </div>
  )
}
