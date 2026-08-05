import { type Grade, gradeName } from 'shared/governance/index'
import { SidebarCard } from '@/components/detail/SidebarCard'
import {
  type Candidate,
  CandidateOutcomeBadge,
  type CandidateResult
} from './CandidateCard'

const rankOrder = (result?: CandidateResult) =>
  result?.rank ?? Number.MAX_SAFE_INTEGER

export function ElectionOutcomeCard({
  candidates,
  candidateResults,
  provisional,
  quorumMet,
  seatCount
}: {
  readonly candidates: ReadonlyArray<Candidate>
  readonly candidateResults: ReadonlyArray<CandidateResult>
  readonly provisional: boolean
  readonly quorumMet: boolean
  readonly seatCount: number
}) {
  const resultByCandidate = new Map(
    candidateResults.map((result) => [result.candidateId, result])
  )
  const tieGroupSizes = candidateResults.reduce((sizes, result) => {
    if (result.tieGroupId !== null && result.tieGroupId !== undefined) {
      sizes.set(result.tieGroupId, (sizes.get(result.tieGroupId) ?? 0) + 1)
    }
    return sizes
  }, new Map<number, number>())
  const ranked = [...candidates].sort(
    (left, right) =>
      rankOrder(resultByCandidate.get(left.id)) -
      rankOrder(resultByCandidate.get(right.id))
  )
  const seated = candidateResults.filter(
    ({ outcome }) => outcome === 'SEATED'
  ).length

  return (
    <SidebarCard title={provisional ? 'Provisional standing' : 'Result'}>
      <ol className="space-y-3">
        {ranked.map((candidate) => {
          const result = resultByCandidate.get(candidate.id)
          const grade: Grade | null | undefined = result?.qualifyingGrade
          const tieGroupSize =
            result?.tieGroupId === null || result?.tieGroupId === undefined
              ? 0
              : (tieGroupSizes.get(result.tieGroupId) ?? 0)
          const tieLocation =
            result?.outcome === 'UNRESOLVED'
              ? 'Seat boundary'
              : result?.outcome === 'RESERVE'
                ? 'Reserve list'
                : 'Seated positions'
          return (
            <li
              key={candidate.id}
              className={`flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0 ${
                result?.tieGroupId === null || result?.tieGroupId === undefined
                  ? 'border-border/50'
                  : 'border-amber-400/70 bg-amber-50/60 px-2 pt-2 dark:bg-amber-950/20'
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {candidate.displayName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {grade === null || grade === undefined
                    ? 'No qualifying grade'
                    : gradeName(grade)}
                </p>
                {result?.tieGroupId === null ||
                result?.tieGroupId === undefined ? null : (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Tied rank · group {result.tieGroupId} · {tieGroupSize}{' '}
                    candidates · {tieLocation}
                  </p>
                )}
              </div>
              <CandidateOutcomeBadge
                outcome={result?.outcome}
                rank={quorumMet && result?.rank ? result.rank : undefined}
              />
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">
        {quorumMet
          ? `${seated} of ${seatCount} ${seatCount === 1 ? 'seat' : 'seats'} filled.`
          : 'Turnout is below the fixed quorum, so no seats are awarded.'}
        {provisional
          ? ' These standings change with every ballot until the round closes.'
          : ''}
      </p>
    </SidebarCard>
  )
}
