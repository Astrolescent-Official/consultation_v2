import { gradeName } from 'shared/governance/index'
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
          days={parameters.temperatureCheck.votingDays}
          quorum={parameters.temperatureCheck.quorum}
          threshold={parameters.temperatureCheck.approvalThreshold}
        />
        {parameters._tag === 'Standard' ? (
          <SnapshotRules
            title="Governance Proposal"
            days={parameters.proposal.votingDays}
            quorum={parameters.proposal.quorum}
            threshold={parameters.proposal.approvalThreshold}
          />
        ) : (
          <dl className="space-y-2">
            <dt className="font-medium">Majority Judgment Election</dt>
            <dd className="text-muted-foreground">
              {parameters.election.reviewDays} review days ·{' '}
              {parameters.election.votingDays} voting days
            </dd>
            <dd className="text-muted-foreground">
              {formatQuorum(parameters.election.quorum)} fixed quorum · minimum{' '}
              {gradeName(parameters.election.minimumMedianGrade)}
            </dd>
            <dd className="text-muted-foreground">
              Rerun: {parameters.election.rerunVotingDays} days ·{' '}
              {formatQuorum(parameters.election.rerunQuorum)} fixed quorum ·
              minimum {gradeName(parameters.election.rerunMinimumMedianGrade)}
            </dd>
          </dl>
        )}
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
