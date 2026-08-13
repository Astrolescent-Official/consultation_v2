import { ExternalLink } from 'lucide-react'
import { type Grade, gradeName } from 'shared/governance/index'
import { Card } from '@/components/ui/card'
import { cn, formatXrd } from '@/lib/utils'
import { type CandidateOutcome, candidateOutcomeCopy } from '../electionDisplay'

// Grades are stored ascending on-ledger but always shown best-first, so the
// strongest option is the one a reader lands on at the top of the list.
const gradesBestFirst: ReadonlyArray<Grade> = [4, 3, 2, 1, 0]

export type Candidate = {
  readonly id: number
  readonly reference?: string
  readonly displayName: string
  readonly description: string
  readonly links: ReadonlyArray<string>
}

export type CandidateResult = {
  readonly candidateId: number
  readonly histogram?: readonly [string, string, string, string, string]
  readonly majorityGrade?: Grade | null
  readonly finalMajorityGrade?: Grade | null
  readonly electable?: boolean
  readonly rank?: number | null
  readonly outcome?: CandidateOutcome
}

const outcomeTone = (outcome: CandidateOutcome) => {
  switch (outcome) {
    case 'SEATED':
      return 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-black'
    case 'RESERVE':
      return 'bg-blue-600 text-white dark:bg-blue-500'
    case 'UNRESOLVED':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    default:
      return 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
  }
}

export function CandidateOutcomeBadge({
  outcome,
  rank
}: {
  readonly outcome: CandidateOutcome
  readonly rank?: number
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-semibold uppercase tracking-wider',
        outcomeTone(outcome)
      )}
    >
      {rank === undefined ? null : <span>#{rank}</span>}
      {candidateOutcomeCopy(outcome)}
    </span>
  )
}

/**
 * Weighted grade distribution as bars rather than raw ledger decimals, so a
 * candidate's spread is readable at a glance the same way the Temperature
 * Check tallies are.
 */
function GradeHistogram({
  histogram,
  majorityGrade
}: {
  readonly histogram: readonly [string, string, string, string, string]
  readonly majorityGrade?: Grade | null
}) {
  // Index the histogram by grade rather than by row position: the rows are
  // ordered best-first, the tuple is stored worst-first.
  const total = gradesBestFirst.reduce<number>(
    (sum, grade) => sum + Number(histogram[grade] ?? '0'),
    0
  )

  return (
    <div className="space-y-1.5">
      {gradesBestFirst.map((grade) => {
        const value = Number(histogram[grade] ?? '0')
        const percentage = total > 0 ? (value / total) * 100 : 0
        return (
          <div key={grade} className="flex items-center gap-3 text-xs">
            <span
              className={cn(
                'w-20 shrink-0',
                grade === majorityGrade
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {gradeName(grade)}
            </span>
            <span className="h-1.5 flex-1 bg-neutral-100 dark:bg-neutral-800">
              <span
                className="block h-full bg-emerald-600 transition-all dark:bg-emerald-500"
                style={{ width: `${percentage}%` }}
              />
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">
              {formatXrd(value)} XRD
            </span>
          </div>
        )
      })}
    </div>
  )
}

function GradeSelector({
  candidate,
  name,
  selected,
  disabled,
  onSelect
}: {
  readonly candidate: Candidate
  readonly name: string
  readonly selected?: Grade
  readonly disabled: boolean
  readonly onSelect: (grade: Grade) => void
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Your grade
        <span className="sr-only"> for {candidate.displayName}</span>
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {gradesBestFirst.map((grade) => (
          <label
            key={grade}
            className={cn(
              'flex items-center justify-center border px-2 py-2 text-center text-xs font-medium transition-colors',
              'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
              'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
              selected === grade
                ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black'
                : 'cursor-pointer border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={grade}
              disabled={disabled}
              checked={selected === grade}
              onChange={() => onSelect(grade)}
            />
            {gradeName(grade)}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function CandidateCard({
  candidate,
  position,
  radioName,
  selectedGrade,
  gradingDisabled,
  showGrading,
  candidateResult,
  minimumMedianGrade,
  showRank,
  onSelectGrade
}: {
  readonly candidate: Candidate
  readonly position: number
  readonly radioName: string
  readonly selectedGrade?: Grade
  readonly gradingDisabled: boolean
  readonly showGrading: boolean
  readonly candidateResult?: CandidateResult
  readonly minimumMedianGrade: Grade
  readonly showRank: boolean
  readonly onSelectGrade: (grade: Grade) => void
}) {
  const rank =
    showRank && candidateResult?.rank ? candidateResult.rank : undefined
  const majorityGrade = candidateResult?.majorityGrade
  const finalMajorityGrade = candidateResult?.finalMajorityGrade

  return (
    <Card className="gap-5 p-6 shadow-none">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {String(position).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-medium leading-tight">
              {candidate.displayName}
            </h3>
            {candidate.reference ? (
              <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                {candidate.reference}
              </p>
            ) : null}
          </div>
        </div>
        {candidateResult ? (
          <CandidateOutcomeBadge
            outcome={candidateResult.outcome}
            rank={rank}
          />
        ) : null}
      </div>

      {candidate.description ? (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {candidate.description}
        </p>
      ) : null}

      {candidate.links.length > 0 ? (
        <ul className="flex flex-wrap gap-4">
          {candidate.links.map((link) => (
            <li key={link}>
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                Candidate profile
                <ExternalLink className="size-3" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {showGrading ? (
        <div className="border-t border-border pt-5">
          <GradeSelector
            candidate={candidate}
            name={radioName}
            selected={selectedGrade}
            disabled={gradingDisabled}
            onSelect={onSelectGrade}
          />
        </div>
      ) : null}

      {candidateResult ? (
        <div className="space-y-4 border-t border-border pt-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                Majority grade
              </dt>
              <dd className="mt-0.5 font-medium">
                {majorityGrade === null || majorityGrade === undefined
                  ? 'None'
                  : gradeName(majorityGrade)}
                {finalMajorityGrade !== null &&
                finalMajorityGrade !== undefined &&
                finalMajorityGrade !== majorityGrade
                  ? ` · tie-adjusted ${gradeName(finalMajorityGrade)}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                Grade floor
              </dt>
              <dd className="mt-0.5 font-medium">
                {gradeName(minimumMedianGrade)} ·{' '}
                <span
                  className={
                    candidateResult.electable
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground'
                  }
                >
                  {candidateResult.electable
                    ? 'Meets grade floor'
                    : 'Below grade floor'}
                </span>
              </dd>
            </div>
          </dl>
          {candidateResult.histogram ? (
            <GradeHistogram
              histogram={candidateResult.histogram}
              majorityGrade={majorityGrade}
            />
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
