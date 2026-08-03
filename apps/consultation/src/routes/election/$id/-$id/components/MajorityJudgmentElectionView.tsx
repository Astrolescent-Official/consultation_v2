import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Users } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  type Grade,
  gradeName,
  type MajorityJudgmentElectionStatus
} from 'shared/governance/index'
import { DetailPageDetails } from '@/components/detail/DetailPageDetails'
import {
  DetailPageHeader,
  DetailPageMetaRow,
  type DetailPageSchedule
} from '@/components/detail/DetailPageHeader'
import { DetailPageLayout } from '@/components/detail/DetailPageLayout'
import { meetsQuorum } from '@/lib/quorum'
import { electionItemStatus, electionStatusCopy } from '../electionDisplay'
import { BallotPanel } from './BallotPanel'
import type { Candidate, CandidateResult } from './CandidateCard'
import { CandidateList } from './CandidateList'
import { Countdown } from './Countdown'
import { ElectionOutcomeCard } from './ElectionOutcomeCard'
import { ElectionRulesCard } from './ElectionRulesCard'
import { buildElectionStages, ElectionStagesCard } from './ElectionStagesCard'
import { ElectionTurnoutCard } from './ElectionTurnoutCard'
import { RoundAuditHistory } from './RoundAuditHistory'

type ElectionResult = {
  readonly round?: 'RoundOne' | 'Rerun'
  readonly candidateResults: ReadonlyArray<CandidateResult>
  readonly tieBreakIterations: number
  readonly unresolvedCandidateIds: ReadonlyArray<number>
  readonly quorumMet?: boolean
}

type HistoricalElectionResult = ElectionResult & {
  readonly round: 'RoundOne' | 'Rerun'
  readonly status: MajorityJudgmentElectionStatus
  readonly totalVotingPower: string
  readonly quorumXrd: string
  readonly provisional: boolean
}

type RoundWindow = {
  readonly round: 'RoundOne' | 'Rerun'
  readonly votingStart: Date
  readonly votingEnd: Date
}

type MajorityJudgmentElectionViewProps = {
  readonly electionId: number
  readonly title: string
  readonly shortDescription?: string
  readonly description?: string
  readonly status: MajorityJudgmentElectionStatus
  readonly candidates: ReadonlyArray<Candidate>
  readonly seatCount: number
  readonly roleId?: string
  readonly temperatureCheckId?: number
  readonly parameterSetId?: string
  readonly parameterSetVersion?: number
  readonly reserveListDays?: number
  readonly tcVotingStart?: Date
  readonly tcVotingEnd?: Date
  readonly votingStart?: Date
  readonly votingEnd?: Date
  readonly rounds?: ReadonlyArray<RoundWindow>
  readonly quorumXrd?: string
  readonly totalVotingPower: string
  readonly minimumMedianGrade?: Grade
  readonly initialGrades?: ReadonlyArray<{
    readonly candidateId: number
    readonly grade: Grade
  }>
  readonly result?: ElectionResult
  readonly results?: ReadonlyArray<HistoricalElectionResult>
  readonly submitting?: boolean
  readonly onSubmit?: (
    grades: ReadonlyArray<{
      readonly candidateId: number
      readonly grade: Grade
    }>
  ) => void
  /** Candidate-list gate summary, rendered above the election's own rules. */
  readonly temperatureCheckStage?: ReactNode
  /** Candidate-list tallies and voter list, for the sidebar. */
  readonly temperatureCheckResults?: ReactNode
  /** Candidate-list For/Against ballot, for the sidebar. */
  readonly temperatureCheckVoting?: ReactNode
  readonly ballotAccountsControl?: ReactNode
  readonly ballotNotice?: ReactNode
  readonly adminControls?: ReactNode
  /** Admin-only hide/unhide badge, rendered beside the header identifiers. */
  readonly visibilityToggle?: ReactNode
  readonly banner?: ReactNode
  readonly hiddenNotice?: ReactNode
}

const emptyInitialGrades: ReadonlyArray<{
  readonly candidateId: number
  readonly grade: Grade
}> = []
const noRounds: ReadonlyArray<RoundWindow> = []

function ElectionQuorumBadge({
  totalVotingPower,
  quorumXrd
}: {
  readonly totalVotingPower: string
  readonly quorumXrd: string
}) {
  const quorumMet = meetsQuorum(totalVotingPower, quorumXrd)
  const quorum = Number(quorumXrd)
  const share = quorum > 0 ? (Number(totalVotingPower) / quorum) * 100 : 0
  const displayPercent = quorumMet ? 100 : Math.min(99, Math.floor(share))

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
        quorumMet
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
      }`}
    >
      {quorumMet ? 'Quorum Reached' : `Quorum ${displayPercent}%`}
    </span>
  )
}

export function MajorityJudgmentElectionView({
  electionId,
  title,
  shortDescription,
  description,
  status,
  candidates,
  seatCount,
  roleId,
  temperatureCheckId,
  parameterSetId,
  parameterSetVersion,
  reserveListDays,
  tcVotingStart,
  tcVotingEnd,
  votingStart,
  votingEnd,
  rounds = noRounds,
  quorumXrd,
  totalVotingPower,
  minimumMedianGrade = 0,
  initialGrades = emptyInitialGrades,
  result,
  results = [],
  submitting = false,
  onSubmit,
  temperatureCheckStage,
  temperatureCheckResults,
  temperatureCheckVoting,
  ballotAccountsControl,
  ballotNotice,
  adminControls,
  visibilityToggle,
  banner,
  hiddenNotice
}: MajorityJudgmentElectionViewProps) {
  const [selectedGrades, setSelectedGrades] = useState(
    () =>
      new Map<number, Grade>(
        initialGrades.map(({ candidateId, grade }) => [candidateId, grade])
      )
  )
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    setSelectedGrades(
      new Map<number, Grade>(
        initialGrades.map(({ candidateId, grade }) => [candidateId, grade])
      )
    )
  }, [initialGrades])

  useEffect(() => {
    const activeDeadline = status === 'TC_LIVE' ? tcVotingEnd : votingEnd
    if (activeDeadline === undefined || now >= activeDeadline.getTime()) return
    const maximumTimeout = 2_147_483_647
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(activeDeadline.getTime() - now, maximumTimeout)
    )
    return () => window.clearTimeout(timer)
  }, [now, status, tcVotingEnd, votingEnd])

  const liveStatus = status === 'LIVE' || status === 'RERUN_LIVE'
  const tcVotingOpen =
    status === 'TC_LIVE' &&
    (tcVotingEnd === undefined || now < tcVotingEnd.getTime())
  const votingOpen =
    liveStatus && (votingEnd === undefined || now < votingEnd.getTime())
  const currentStatusCopy =
    status === 'TC_LIVE' && !tcVotingOpen
      ? 'Candidate-list voting closed; awaiting the verified outcome'
      : status === 'MJ_PENDING'
        ? 'Awaiting the Governance Operator to open grading'
        : liveStatus && !votingOpen
          ? 'Voting closed; finalizing result'
          : electionStatusCopy(status)
  const priorBallot = initialGrades.length > 0
  const historicalResults = results.filter(
    (historicalResult) =>
      !historicalResult.provisional && historicalResult.round !== result?.round
  )
  // Turnout is only meaningful once a round is open or has been tallied.
  // Before voting opens there are no ballots, and rendering "0 / quorum" would
  // read as zero participation rather than as voting not having started.
  const showTurnout =
    quorumXrd !== undefined && (votingOpen || result !== undefined)
  // Once the election has reached a terminal state a blank grade picker is
  // noise, but before that it shows voters what they will be asked to do.
  const gradingRelevant =
    status !== 'TC_FAILED' &&
    status !== 'FAILED' &&
    status !== 'FINAL' &&
    status !== 'TIE_UNRESOLVED'
  const showBallot = liveStatus || priorBallot
  const candidateResults = useMemo(
    () => result?.candidateResults ?? [],
    [result]
  )

  const schedule: Array<DetailPageSchedule> = []
  if (tcVotingStart !== undefined && tcVotingEnd !== undefined) {
    schedule.push({
      label: 'Candidate list',
      start: tcVotingStart,
      deadline: tcVotingEnd
    })
  }
  if (votingStart !== undefined && votingEnd !== undefined) {
    schedule.push({ label: 'Voting', start: votingStart, deadline: votingEnd })
  }

  const submit = () => {
    if (
      !votingOpen ||
      candidates.some((candidate) => !selectedGrades.has(candidate.id)) ||
      onSubmit === undefined
    ) {
      return
    }
    onSubmit(
      candidates.map((candidate) => ({
        candidateId: candidate.id,
        grade: selectedGrades.get(candidate.id) ?? 0
      }))
    )
  }

  const countdown =
    tcVotingOpen && tcVotingEnd !== undefined ? (
      <Countdown label="TC voting closes" target={tcVotingEnd} />
    ) : votingOpen && votingEnd !== undefined ? (
      <Countdown label="Voting closes" target={votingEnd} />
    ) : undefined

  const header = (
    <DetailPageHeader
      status={electionItemStatus({ status, tcVotingOpen, votingOpen })}
      typeBadge="Election"
      id={electionId}
      title={title}
      schedule={schedule}
      quorumBadge={
        showTurnout && quorumXrd !== undefined ? (
          <ElectionQuorumBadge
            totalVotingPower={totalVotingPower}
            quorumXrd={quorumXrd}
          />
        ) : undefined
      }
      originBadge={
        <div className="flex items-center gap-2">
          {temperatureCheckId === undefined ? null : (
            <Link
              to="/tc/$id"
              params={{ id: String(temperatureCheckId) }}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 hover:text-foreground transition-colors"
            >
              <span>Candidate-list TC #{temperatureCheckId}</span>
              <ArrowUpRight className="size-3" />
            </Link>
          )}
          {visibilityToggle}
        </div>
      }
      extraMeta={
        <DetailPageMetaRow icon={<Users className="size-4" />}>
          {seatCount} {seatCount === 1 ? 'seat' : 'seats'}
          {roleId === undefined ? '' : ` · Role ${roleId}`}
        </DetailPageMetaRow>
      }
    >
      <div className="mt-6 border-l-2 border-foreground pl-3">
        <p className="text-sm font-medium text-foreground">
          {currentStatusCopy}
        </p>
        {countdown ? (
          <p className="text-sm text-muted-foreground">{countdown}</p>
        ) : null}
        {status === 'RERUN_LIVE' ? (
          <p className="mt-1 text-sm text-muted-foreground">
            This rerun uses the same quorum and grade floor as Round 1. Minimum
            majority grade: {gradeName(minimumMedianGrade)}.
          </p>
        ) : null}
      </div>
    </DetailPageHeader>
  )

  const details = (
    <>
      {hiddenNotice}
      {banner}
      {temperatureCheckStage}
      <ElectionRulesCard
        seatCount={seatCount}
        roleId={roleId}
        parameterSetId={parameterSetId}
        parameterSetVersion={parameterSetVersion}
        quorumXrd={quorumXrd}
        minimumMedianGrade={minimumMedianGrade}
        reserveListDays={reserveListDays}
      />
      {shortDescription === undefined ? null : (
        <DetailPageDetails
          shortDescription={shortDescription}
          description={description}
          filename={`election-${electionId}-details.md`}
        />
      )}
      <CandidateList
        candidates={candidates}
        description={
          liveStatus
            ? 'Grade every candidate. The recorded display order is immutable.'
            : 'This is the immutable candidate list committed when the election and its Temperature Check were created.'
        }
        selectedGrades={selectedGrades}
        candidateResults={candidateResults}
        minimumMedianGrade={minimumMedianGrade}
        showGrading={gradingRelevant || priorBallot}
        gradingDisabled={!votingOpen || submitting}
        showRank={result?.quorumMet !== false}
        onSelectGrade={(candidateId, grade) =>
          setSelectedGrades((current) => {
            const next = new Map(current)
            next.set(candidateId, grade)
            return next
          })
        }
      />
      {result ? (
        <ElectionResultNotes
          status={status}
          result={result}
          seatCount={seatCount}
        />
      ) : null}
      {historicalResults.length > 0 ? (
        <RoundAuditHistory rounds={historicalResults} />
      ) : null}
      {adminControls}
    </>
  )

  const stagesCard = (
    <ElectionStagesCard
      stages={buildElectionStages({
        status,
        tcVotingStart,
        tcVotingEnd,
        rounds
      })}
      statusCopy={currentStatusCopy}
      countdown={countdown}
    />
  )
  const turnoutCard =
    showTurnout && quorumXrd !== undefined ? (
      <ElectionTurnoutCard
        totalVotingPower={totalVotingPower}
        quorumXrd={quorumXrd}
        minimumMedianGrade={minimumMedianGrade}
        roundLabel={
          result?.round === 'Rerun' || status === 'RERUN_LIVE'
            ? 'Round 2 rerun'
            : 'Round 1'
        }
      />
    ) : null
  const outcomeCard = result ? (
    <ElectionOutcomeCard
      candidates={candidates}
      candidateResults={candidateResults}
      provisional={votingOpen}
      quorumMet={result.quorumMet !== false}
      seatCount={seatCount}
    />
  ) : null
  const ballotPanel = showBallot ? (
    <BallotPanel
      candidates={candidates}
      selectedGrades={selectedGrades}
      votingOpen={votingOpen}
      submitting={submitting}
      priorBallot={priorBallot}
      accountsControl={ballotAccountsControl}
      notice={ballotNotice}
      onSubmit={submit}
    />
  ) : null

  return (
    <DetailPageLayout
      header={header}
      details={details}
      sidebar={
        <div className="space-y-6">
          {stagesCard}
          {temperatureCheckVoting}
          {temperatureCheckResults}
          {ballotPanel}
          {turnoutCard}
          {outcomeCard}
        </div>
      }
      resultsContent={
        <>
          {stagesCard}
          {temperatureCheckResults}
          {turnoutCard}
          {outcomeCard}
        </>
      }
      votingContent={
        <div className="space-y-6">
          {temperatureCheckVoting}
          {ballotPanel}
        </div>
      }
    />
  )
}

function ElectionResultNotes({
  status,
  result,
  seatCount
}: {
  readonly status: MajorityJudgmentElectionStatus
  readonly result: ElectionResult
  readonly seatCount: number
}) {
  const unfilledSeats =
    status === 'FINAL' &&
    result.candidateResults.filter(({ outcome }) => outcome === 'SEATED')
      .length < seatCount

  const notes: Array<string> = []
  if (result.tieBreakIterations > 0) {
    notes.push(
      `Deterministic tie-break used ${result.tieBreakIterations} ${
        result.tieBreakIterations === 1 ? 'iteration' : 'iterations'
      }.`
    )
  }
  if (status === 'TIE_UNRESOLVED') {
    notes.push(
      'The consequential tie must be resolved under the adopted governance process and recorded on-ledger.'
    )
  }
  if (status === 'ROUND_1_FAILED') {
    notes.push(
      'Turnout was below quorum. The election remains closed unless the RAC opens a Round 2 rerun.'
    )
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-foreground">
        {status === 'LIVE' || status === 'RERUN_LIVE'
          ? 'Provisional results'
          : 'Election result details'}
      </h2>
      {notes.map((note) => (
        <p key={note} className="text-sm text-muted-foreground">
          {note}
        </p>
      ))}
      {status === 'FAILED' ? (
        <p className="text-sm text-muted-foreground">
          No candidate is elected; all seats return to the applicable vacancy or
          founding-election process.{' '}
          <Link to="/about" className="underline underline-offset-4">
            Read the governance policy
          </Link>
          .
        </p>
      ) : null}
      {unfilledSeats ? (
        <p className="text-sm text-muted-foreground">
          Unfilled seats return to the applicable vacancy or founding-election
          process.{' '}
          <Link to="/about" className="underline underline-offset-4">
            Read the governance policy
          </Link>
          .
        </p>
      ) : null}
    </section>
  )
}
