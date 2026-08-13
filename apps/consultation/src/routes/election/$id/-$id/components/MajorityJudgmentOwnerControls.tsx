import { useEffect, useId, useState } from 'react'
import {
  canStartMajorityJudgmentRerun,
  type MajorityJudgmentElectionStatus,
  type MajorityJudgmentRoundId
} from 'shared/governance/index'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type MajorityJudgmentOwnerControlsProps = {
  readonly status: MajorityJudgmentElectionStatus
  readonly round: MajorityJudgmentRoundId
  readonly unresolvedCandidateIds: ReadonlyArray<number>
  readonly busy: boolean
  readonly onStartRerun: (votingStart: Date) => void
  readonly onRecordTieResolution: (
    orderedCandidateIds: ReadonlyArray<number>
  ) => void
}

const moveCandidate = (
  candidates: ReadonlyArray<number>,
  index: number,
  offset: -1 | 1
) => {
  const target = index + offset
  if (target < 0 || target >= candidates.length) return [...candidates]
  return candidates.map((candidateId, candidateIndex) => {
    if (candidateIndex === index) return candidates[target] ?? candidateId
    if (candidateIndex === target) return candidates[index] ?? candidateId
    return candidateId
  })
}

export function MajorityJudgmentOwnerControls({
  status,
  round,
  unresolvedCandidateIds,
  busy,
  onStartRerun,
  onRecordTieResolution
}: MajorityJudgmentOwnerControlsProps) {
  const rerunStartId = useId()
  const [rerunStart, setRerunStart] = useState('')
  const [tieOrder, setTieOrder] = useState(() => [...unresolvedCandidateIds])

  useEffect(() => {
    setTieOrder([...unresolvedCandidateIds])
  }, [unresolvedCandidateIds])

  const canRerun = canStartMajorityJudgmentRerun(status)
  const canResolveTie =
    status === 'TIE_UNRESOLVED' &&
    tieOrder.length === unresolvedCandidateIds.length &&
    tieOrder.length > 0

  // Visibility moved to the header badge every detail page shares, so an
  // election with nothing to adjudicate has no operator card at all.
  if (!canRerun && !canResolveTie) return null

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">
          Governance Operator controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canRerun ? (
          <div className="space-y-2">
            <label htmlFor={rerunStartId} className="block space-y-1 text-sm">
              <span>Rerun voting start</span>
              <Input
                id={rerunStartId}
                type="datetime-local"
                value={rerunStart}
                disabled={busy}
                onChange={(event) => setRerunStart(event.target.value)}
              />
            </label>
            <Button
              type="button"
              disabled={busy || rerunStart.length === 0}
              onClick={() => onStartRerun(new Date(rerunStart))}
            >
              Open Round 2 rerun
            </Button>
          </div>
        ) : null}

        {canResolveTie ? (
          <div className="space-y-3 first:border-t-0 first:pt-0 border-t pt-4">
            <div>
              <p className="text-sm font-medium">Recorded adjudication order</p>
              <p className="text-xs text-muted-foreground">
                This order must match the adopted governance determination for
                the unresolved {round} tie.
              </p>
            </div>
            <ol className="space-y-2">
              {tieOrder.map((candidateId, index) => (
                <li
                  key={candidateId}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>Candidate {candidateId}</span>
                  <span className="flex gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={busy || index === 0}
                      aria-label={`Move candidate ${candidateId} up`}
                      onClick={() =>
                        setTieOrder((current) =>
                          moveCandidate(current, index, -1)
                        )
                      }
                    >
                      Up
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={busy || index === tieOrder.length - 1}
                      aria-label={`Move candidate ${candidateId} down`}
                      onClick={() =>
                        setTieOrder((current) =>
                          moveCandidate(current, index, 1)
                        )
                      }
                    >
                      Down
                    </Button>
                  </span>
                </li>
              ))}
            </ol>
            <Button
              type="button"
              disabled={busy}
              onClick={() => onRecordTieResolution(tieOrder)}
            >
              Record tie resolution
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
