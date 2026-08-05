import { type Grade, gradeName } from 'shared/governance/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { gradeQuantileLabel } from '@/lib/gradeQuantile'
import { formatQuorum } from '@/lib/utils'

export function ElectionRulesCard({
  seatCount,
  roleId,
  parameterSetId,
  parameterSetVersion,
  quorumXrd,
  minimumMedianGrade,
  gradeQuantileApplied,
  reserveListDays
}: {
  readonly seatCount: number
  readonly roleId?: string
  readonly parameterSetId?: string
  readonly parameterSetVersion?: number
  readonly quorumXrd?: string
  readonly minimumMedianGrade: Grade
  readonly gradeQuantileApplied: string
  readonly reserveListDays?: number
}) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Election rules</CardTitle>
        {parameterSetId === undefined ||
        parameterSetVersion === undefined ? null : (
          <p className="text-sm text-muted-foreground">
            {parameterSetId} · version {parameterSetVersion}
          </p>
        )}
      </CardHeader>
      <CardContent className="grid gap-5 text-sm md:grid-cols-2">
        <dl className="space-y-2">
          <dt className="font-medium">Seats</dt>
          <dd className="text-muted-foreground">
            {seatCount} {seatCount === 1 ? 'seat' : 'seats'}
            {roleId === undefined ? '' : ` · role ${roleId}`}
          </dd>
          {reserveListDays === undefined ? null : (
            <dd className="text-muted-foreground">
              Reserve list valid for {reserveListDays}{' '}
              {reserveListDays === 1 ? 'day' : 'days'}
            </dd>
          )}
        </dl>
        <dl className="space-y-2">
          <dt className="font-medium">Majority Judgment</dt>
          {quorumXrd === undefined ? (
            <dd className="text-muted-foreground">
              Round rules are fixed when the operator opens grading.
            </dd>
          ) : (
            <dd className="text-muted-foreground">
              {formatQuorum(quorumXrd)} fixed quorum
            </dd>
          )}
          <dd className="text-muted-foreground">
            Grade quantile: {gradeQuantileLabel(gradeQuantileApplied)}
          </dd>
          <dd className="text-muted-foreground">
            Minimum qualifying grade: {gradeName(minimumMedianGrade)}
          </dd>
          <dd className="text-muted-foreground">
            Equal qualifying grades are ordered by the majority gauge; equal
            gauge ranks remain ties.
          </dd>
        </dl>
      </CardContent>
    </Card>
  )
}
