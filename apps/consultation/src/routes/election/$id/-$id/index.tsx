import { Result, useAtom, useAtomValue } from '@effect-atom/atom-react'
import { Cause } from 'effect'
import { useCallback, useState } from 'react'
import {
  MajorityJudgmentCandidateIdSchema,
  type MajorityJudgmentElectionId
} from 'shared/governance/index'
import {
  recordMajorityJudgmentTieResolutionAtom,
  startMajorityJudgmentRerunAtom,
  toggleMajorityJudgmentElectionHiddenAtom
} from '@/atom/adminAtom'
import { accountsAtom } from '@/atom/dappToolkitAtom'
import {
  majorityJudgmentElectionAtom,
  majorityJudgmentVoterEntriesAtom,
  voteOnMajorityJudgmentBatchAtom
} from '@/atom/majorityJudgmentAtom'
import { Checkbox } from '@/components/ui/checkbox'
import { InlineCode } from '@/components/ui/typography'
import { useCurrentAccount } from '@/hooks/useCurrentAccount'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { MajorityJudgmentElectionView } from './components/MajorityJudgmentElectionView'
import { MajorityJudgmentOwnerControls } from './components/MajorityJudgmentOwnerControls'

// Stable identities: both are passed to children that reset state whenever the
// prop identity changes, so a fresh literal per render would discard the
// operator's in-progress grade or tie-order edits.
const NO_GRADES: ReadonlyArray<{
  readonly candidateId: number
  readonly grade: 0 | 1 | 2 | 3 | 4
}> = []
const NO_CANDIDATE_IDS: ReadonlyArray<number> = []

export function Page({
  electionId
}: {
  readonly electionId: MajorityJudgmentElectionId
}) {
  const electionResult = useAtomValue(majorityJudgmentElectionAtom(electionId))
  const voterEntriesResult = useAtomValue(
    majorityJudgmentVoterEntriesAtom(electionId)
  )
  const accountsResult = useAtomValue(accountsAtom)
  const [voteResult, vote] = useAtom(voteOnMajorityJudgmentBatchAtom)
  const [rerunResult, startRerun] = useAtom(startMajorityJudgmentRerunAtom)
  const [tieResult, recordTieResolution] = useAtom(
    recordMajorityJudgmentTieResolutionAtom
  )
  const [visibilityResult, toggleVisibility] = useAtom(
    toggleMajorityJudgmentElectionHiddenAtom
  )
  const [voteAllAccounts, setVoteAllAccounts] = useState(false)
  const currentAccount = useCurrentAccount()
  const isAdmin = useIsAdmin()

  const submit = useCallback(
    (
      grades: ReadonlyArray<{ candidateId: number; grade: 0 | 1 | 2 | 3 | 4 }>
    ) => {
      if (!Result.isSuccess(accountsResult)) return
      const accounts = voteAllAccounts
        ? accountsResult.value
        : currentAccount === undefined
          ? []
          : [currentAccount]
      if (!Result.isSuccess(electionResult) || accounts.length === 0) return

      vote({
        accounts,
        electionId,
        round: electionResult.value.currentRound.round,
        candidateIds: electionResult.value.candidates.map(({ id }) => id),
        grades: grades.map(({ candidateId, grade }) => ({
          candidateId: MajorityJudgmentCandidateIdSchema.make(candidateId),
          grade
        }))
      })
    },
    [
      accountsResult,
      currentAccount,
      electionId,
      electionResult,
      vote,
      voteAllAccounts
    ]
  )

  return Result.builder(electionResult)
    .onInitial(() => <div>Loading election…</div>)
    .onFailure((error) => <InlineCode>{Cause.pretty(error)}</InlineCode>)
    .onSuccess((response) => {
      if (response.election.hidden && !isAdmin) {
        return (
          <div className="py-20 text-center text-muted-foreground">
            This election has been hidden.
          </div>
        )
      }
      const voterEntries = Result.isSuccess(voterEntriesResult)
        ? voterEntriesResult.value
        : []
      const currentEntry =
        currentAccount === undefined
          ? undefined
          : voterEntries.find(
              ({ accountAddress }) => accountAddress === currentAccount.address
            )
      const connectedAccountCount = Result.isSuccess(accountsResult)
        ? accountsResult.value.length
        : 0
      const serializedBallots = new Set(
        voterEntries.map(({ grades }) => JSON.stringify(grades))
      )
      const mixedBallots =
        voteAllAccounts && voterEntries.length > 1 && serializedBallots.size > 1

      return (
        <div className="space-y-4">
          {connectedAccountCount > 1 ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={voteAllAccounts}
                onCheckedChange={(checked) =>
                  setVoteAllAccounts(checked === true)
                }
                disabled={voteResult.waiting}
              />
              Submit this complete ballot from all connected accounts (
              {connectedAccountCount})
            </label>
          ) : null}
          {mixedBallots ? (
            <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
              Connected accounts currently have mixed ballots. Choose grades
              explicitly before replacing them together.
            </p>
          ) : null}
          <MajorityJudgmentElectionView
            title={response.election.title}
            status={response.election.status}
            candidates={response.candidates}
            seatCount={response.election.seatCount}
            roleId={response.election.roleId}
            temperatureCheckId={response.election.temperatureCheckId}
            parameterSetId={response.election.parameterSetId}
            parameterSetVersion={response.election.parameterSetVersion}
            reviewStart={response.election.reviewStart}
            reviewEnd={response.election.reviewEnd}
            votingStart={response.currentRound.votingStart}
            votingEnd={response.currentRound.votingEnd}
            quorumXrd={response.currentRound.quorumXrd}
            totalVotingPower={response.result?.totalVotingPower ?? '0'}
            minimumMedianGrade={response.currentRound.minimumMedianGrade}
            initialGrades={mixedBallots ? NO_GRADES : currentEntry?.grades}
            result={response.result}
            submitting={voteResult.waiting}
            onSubmit={submit}
          />
          {isAdmin ? (
            <MajorityJudgmentOwnerControls
              status={response.election.status}
              round={response.currentRound.round}
              hidden={response.election.hidden}
              unresolvedCandidateIds={
                response.result?.unresolvedCandidateIds ?? NO_CANDIDATE_IDS
              }
              busy={
                rerunResult.waiting ||
                tieResult.waiting ||
                visibilityResult.waiting
              }
              onStartRerun={(votingStart) =>
                startRerun({ electionId, votingStart })
              }
              onRecordTieResolution={(orderedCandidateIds) =>
                recordTieResolution({
                  electionId,
                  round: response.currentRound.round,
                  orderedCandidateIds: orderedCandidateIds.map((candidateId) =>
                    MajorityJudgmentCandidateIdSchema.make(candidateId)
                  )
                })
              }
              onToggleVisibility={() => toggleVisibility(electionId)}
            />
          ) : null}
        </div>
      )
    })
    .render()
}
