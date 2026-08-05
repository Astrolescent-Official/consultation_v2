import { useId } from 'react'
import type { Grade } from 'shared/governance/index'
import {
  type Candidate,
  CandidateCard,
  type CandidateResult
} from './CandidateCard'

export function CandidateList({
  candidates,
  description,
  selectedGrades,
  candidateResults,
  minimumMedianGrade,
  gradeQuantileApplied,
  showGrading,
  gradingDisabled,
  showRank,
  onSelectGrade
}: {
  readonly candidates: ReadonlyArray<Candidate>
  readonly description: string
  readonly selectedGrades: ReadonlyMap<number, Grade>
  readonly candidateResults: ReadonlyArray<CandidateResult>
  readonly minimumMedianGrade: Grade
  readonly gradeQuantileApplied: string
  readonly showGrading: boolean
  readonly gradingDisabled: boolean
  readonly showRank: boolean
  readonly onSelectGrade: (candidateId: number, grade: Grade) => void
}) {
  // The detail layout renders this list once per breakpoint, so the radio
  // groups need a per-instance name or the two copies would fight over which
  // grade is checked.
  const nameScope = useId()
  const resultByCandidate = new Map(
    candidateResults.map((result) => [result.candidateId, result])
  )

  return (
    <section aria-label="Candidates" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Candidates</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">
        {candidates.map((candidate, index) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            position={index + 1}
            radioName={`${nameScope}-candidate-${candidate.id}`}
            selectedGrade={selectedGrades.get(candidate.id)}
            gradingDisabled={gradingDisabled}
            showGrading={showGrading}
            candidateResult={resultByCandidate.get(candidate.id)}
            minimumMedianGrade={minimumMedianGrade}
            gradeQuantileApplied={gradeQuantileApplied}
            showRank={showRank}
            onSelectGrade={(grade) => onSelectGrade(candidate.id, grade)}
          />
        ))}
      </div>
    </section>
  )
}
