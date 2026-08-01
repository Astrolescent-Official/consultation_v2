import {
  Result,
  useAtom,
  useAtomRefresh,
  useAtomValue
} from '@effect-atom/atom-react'
import { Cause, Option } from 'effect'
import { useCallback, useEffect, useState } from 'react'
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
import { ElectionNotIndexedYetError } from '@/atom/voteClient'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { InlineCode } from '@/components/ui/typography'
import { useCurrentAccount } from '@/hooks/useCurrentAccount'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { automaticElectionRefreshDelay } from './automaticRefresh'
import { ElectionTemperatureCheckStage } from './components/ElectionTemperatureCheckStage'
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
  const electionAtom = majorityJudgmentElectionAtom(electionId)
  const electionResult = useAtomValue(electionAtom)
  const refreshElection = useAtomRefresh(electionAtom)
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
  const [now, setNow] = useState(Date.now)
  const [automaticRefreshAttempt, setAutomaticRefreshAttempt] = useState(0)
  const currentAccount = useCurrentAccount()
  const isAdmin = useIsAdmin()
  const electionError = Result.error(electionResult)
  const isIndexing = Option.exists(
    electionError,
    (error) => error instanceof ElectionNotIndexedYetError
  )
  const isAwaitingOutcomeProjection =
    Result.isSuccess(electionResult) &&
    electionResult.value.election.tcOutcome === 'PENDING' &&
    now >= electionResult.value.election.tcVotingEnd.getTime()
  const isWaitingForProjection = isIndexing || isAwaitingOutcomeProjection
  const automaticRefreshDelay = automaticElectionRefreshDelay(
    automaticRefreshAttempt
  )
  const automaticRefreshPaused =
    isWaitingForProjection && automaticRefreshDelay === undefined

  useEffect(() => {
    if (!Result.isSuccess(electionResult)) return
    const deadline = electionResult.value.election.tcVotingEnd.getTime()
    if (now >= deadline) return
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(deadline - now, 2_147_483_647)
    )
    return () => window.clearTimeout(timer)
  }, [electionResult, now])

  useEffect(() => {
    if (!isWaitingForProjection) {
      setAutomaticRefreshAttempt(0)
      return
    }
    if (automaticRefreshDelay === undefined) return
    const timer = window.setTimeout(() => {
      refreshElection()
      setAutomaticRefreshAttempt((attempt) => attempt + 1)
    }, automaticRefreshDelay)
    return () => window.clearTimeout(timer)
  }, [automaticRefreshDelay, isWaitingForProjection, refreshElection])

  const checkNow = useCallback(() => {
    setAutomaticRefreshAttempt(0)
    refreshElection()
  }, [refreshElection])

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
    .onFailure((error) =>
      isIndexing ? (
        <div className="space-y-3 py-12 text-center">
          <p className="font-medium">Election not available yet</p>
          <p className="text-sm text-muted-foreground">
            The election is not available in the collector yet. It may still be
            indexing, or this election ID may not exist.
          </p>
          {automaticRefreshPaused ? (
            <p className="text-xs text-muted-foreground">
              Automatic checks paused after five attempts.
            </p>
          ) : null}
          <Button type="button" variant="outline" onClick={checkNow}>
            Check now
          </Button>
        </div>
      ) : (
        <InlineCode>{Cause.pretty(error)}</InlineCode>
      )
    )
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
      const majorityJudgmentVoting =
        response.election.status === 'LIVE' ||
        response.election.status === 'RERUN_LIVE'

      return (
        <div className="space-y-4">
          {automaticRefreshPaused && isAwaitingOutcomeProjection ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-3 text-sm text-muted-foreground">
              <span>
                The verified outcome is still pending; automatic checks have
                paused.
              </span>
              <Button type="button" variant="outline" onClick={checkNow}>
                Check now
              </Button>
            </div>
          ) : null}
          <ElectionTemperatureCheckStage
            temperatureCheckId={response.election.temperatureCheckId}
            electionId={electionId}
            status={response.election.status}
            tcVotingEnd={response.election.tcVotingEnd}
            tcOutcome={response.election.tcOutcome}
            tcOutcomeRecordedAt={response.election.tcOutcomeRecordedAt}
            result={response.temperatureCheckResult}
          />
          {majorityJudgmentVoting && connectedAccountCount > 1 ? (
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id="mj-vote-all-accounts"
                checked={voteAllAccounts}
                onCheckedChange={(checked) =>
                  setVoteAllAccounts(checked === true)
                }
                disabled={voteResult.waiting}
              />
              <label htmlFor="mj-vote-all-accounts">
                Submit this complete ballot from all connected accounts (
                {connectedAccountCount})
              </label>
            </div>
          ) : null}
          {majorityJudgmentVoting && mixedBallots ? (
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
            tcVotingStart={response.election.tcVotingStart}
            tcVotingEnd={response.election.tcVotingEnd}
            votingStart={response.currentRound.votingStart}
            votingEnd={response.currentRound.votingEnd}
            quorumXrd={response.currentRound.quorumXrd}
            totalVotingPower={response.result?.totalVotingPower ?? '0'}
            minimumMedianGrade={response.currentRound.minimumMedianGrade}
            initialGrades={mixedBallots ? NO_GRADES : currentEntry?.grades}
            result={response.result}
            results={response.results}
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
