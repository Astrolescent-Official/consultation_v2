import type { GovernanceParameterSetSnapshot } from 'shared/governance/schemas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatApprovalThreshold, formatQuorum } from '@/lib/utils'

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
        <SnapshotRules
          title="Temperature Check"
          days={parameters.temperatureCheckDays}
          quorum={parameters.temperatureCheckQuorum}
          threshold={parameters.temperatureCheckApprovalThreshold}
        />
        <SnapshotRules
          title="Governance Proposal"
          days={parameters.proposalLengthDays}
          quorum={parameters.proposalQuorum}
          threshold={parameters.proposalApprovalThreshold}
        />
      </CardContent>
    </Card>
  )
}

const SnapshotRules = ({
  title,
  days,
  quorum,
  threshold
}: {
  title: string
  days: number
  quorum: string
  threshold: string
}) => (
  <dl className="space-y-2">
    <dt className="font-medium">{title}</dt>
    <dd className="text-muted-foreground">{days} days</dd>
    <dd className="text-muted-foreground">{formatQuorum(quorum)} quorum</dd>
    <dd className="text-muted-foreground">
      Approval threshold: {formatApprovalThreshold(threshold)}
    </dd>
  </dl>
)
