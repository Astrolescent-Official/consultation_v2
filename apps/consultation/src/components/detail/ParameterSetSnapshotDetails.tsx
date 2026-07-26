import type { GovernanceParameterSetSnapshot } from 'shared/governance/schemas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatXrd } from '@/lib/utils'

export const ParameterSetSnapshotDetails = ({
  parameterSet
}: {
  parameterSet: GovernanceParameterSetSnapshot
}) => {
  const parameters = parameterSet.parameters

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Governance rules</CardTitle>
        <p className="text-sm text-muted-foreground">
          {parameterSet.label} · {parameterSet.id} · version{' '}
          {parameterSet.version}
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 text-sm md:grid-cols-2">
        <dl className="space-y-2">
          <dt className="font-medium">Temperature Check</dt>
          <dd className="text-muted-foreground">
            {parameters.temperatureCheckDays} days
          </dd>
          <dd className="text-muted-foreground">
            {formatXrd(Number(parameters.temperatureCheckQuorum))} XRD quorum
          </dd>
          <dd className="text-muted-foreground">
            {parameters.temperatureCheckApprovalThreshold} approval threshold (
            {(
              Number(parameters.temperatureCheckApprovalThreshold) * 100
            ).toFixed(2)}
            %)
          </dd>
        </dl>
        <dl className="space-y-2">
          <dt className="font-medium">Governance Proposal</dt>
          <dd className="text-muted-foreground">
            {parameters.proposalLengthDays} days
          </dd>
          <dd className="text-muted-foreground">
            {formatXrd(Number(parameters.proposalQuorum))} XRD quorum
          </dd>
          <dd className="text-muted-foreground">
            {parameters.proposalApprovalThreshold} approval threshold (
            {(Number(parameters.proposalApprovalThreshold) * 100).toFixed(2)}%)
          </dd>
        </dl>
      </CardContent>
    </Card>
  )
}
