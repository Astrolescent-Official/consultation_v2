import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  type Grade,
  gradeName,
  type MajorityJudgmentElectionStatus
} from 'shared/governance/index'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Candidate = {
  readonly id: number
  readonly reference?: string
  readonly displayName: string
  readonly description: string
  readonly links: ReadonlyArray<string>
}

type CandidateResult = {
  readonly candidateId: number
  readonly histogram?: readonly [string, string, string, string, string]
  readonly majorityGrade?: Grade | null
  readonly finalMajorityGrade?: Grade | null
  readonly electable?: boolean
  readonly rank?: number | null
  readonly outcome?: 'SEATED' | 'RESERVE' | 'NOT_ELECTABLE' | 'UNRESOLVED'
}

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

type MajorityJudgmentElectionViewProps = {
  readonly title: string
  readonly status: MajorityJudgmentElectionStatus
  readonly candidates: ReadonlyArray<Candidate>
  readonly seatCount: number
  readonly roleId?: string
  readonly temperatureCheckId?: number
  readonly parameterSetId?: string
  readonly parameterSetVersion?: number
  readonly tcVotingStart?: Date
  readonly tcVotingEnd?: Date
  readonly votingStart?: Date
  readonly votingEnd?: Date
  readonly quorumXrd: string
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
}

const grades: ReadonlyArray<Grade> = [0, 1, 2, 3, 4]
const emptyInitialGrades: ReadonlyArray<{
  readonly candidateId: number
  readonly grade: Grade
}> = []

const statusCopy = (status: MajorityJudgmentElectionStatus) => {
  switch (status) {
    case 'PENDING':
      return 'Election scheduled'
    case 'TC_LIVE':
      return 'Candidate list review — vote For or Against'
    case 'TC_FAILED':
      return 'Candidate list not approved — this election will not proceed'
    case 'MJ_PENDING':
      return 'Candidate list approved — grading has not opened'
    case 'LIVE':
      return 'Round one voting'
    case 'ROUND_1_FAILED':
      return 'Turnout below quorum — awaiting a rerun decision'
    case 'RERUN_PENDING':
      return 'Rerun pending'
    case 'RERUN_LIVE':
      return 'Second-round voting'
    case 'TIE_UNRESOLVED':
      return 'Governance tie resolution required'
    case 'FAILED':
      return 'The rerun did not meet quorum'
    case 'FINAL':
      return 'Official result'
  }
}

const outcomeCopy = (outcome: CandidateResult['outcome']) => {
  switch (outcome) {
    case 'SEATED':
      return 'Seated'
    case 'RESERVE':
      return 'Reserve'
    case 'UNRESOLVED':
      return 'Tie unresolved'
    case 'NOT_ELECTABLE':
    case undefined:
      return 'Not elected'
  }
}

const dateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(value)

const remainingTime = (target: Date, now: number) => {
  const remaining = Math.max(0, target.getTime() - now)
  const totalMinutes = Math.ceil(remaining / 60_000)
  const days = Math.floor(totalMinutes / 1_440)
  const hours = Math.floor((totalMinutes % 1_440) / 60)
  const minutes = totalMinutes % 60
  return `${days}d ${hours}h ${minutes}m`
}

function Countdown({
  label,
  target
}: {
  readonly label: string
  readonly target: Date
}) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <span>
      {label} in {remainingTime(target, now)}
    </span>
  )
}

export function MajorityJudgmentElectionView({
  title,
  status,
  candidates,
  seatCount,
  roleId,
  temperatureCheckId,
  parameterSetId,
  parameterSetVersion,
  tcVotingStart,
  tcVotingEnd,
  votingStart,
  votingEnd,
  quorumXrd,
  totalVotingPower,
  minimumMedianGrade = 0,
  initialGrades = emptyInitialGrades,
  result,
  results = [],
  submitting = false,
  onSubmit
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
      : liveStatus && !votingOpen
        ? 'Voting closed; finalizing result'
        : statusCopy(status)
  const remaining = candidates.filter(
    (candidate) => !selectedGrades.has(candidate.id)
  ).length
  const priorBallot = initialGrades.length > 0
  const resultByCandidate = useMemo(
    () =>
      new Map<number, CandidateResult>(
        (result?.candidateResults ?? []).map((candidateResult) => [
          candidateResult.candidateId,
          candidateResult
        ])
      ),
    [result]
  )
  const historicalResults = results.filter(
    (historicalResult) =>
      !historicalResult.provisional && historicalResult.round !== result?.round
  )

  const submit = () => {
    if (!votingOpen || remaining > 0 || onSubmit === undefined) return
    onSubmit(
      candidates.map((candidate) => ({
        candidateId: candidate.id,
        grade: selectedGrades.get(candidate.id) ?? 0
      }))
    )
  }

  return (
    <div className="space-y-8">
      <header className="border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-neutral-200 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            Election
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {seatCount} {seatCount === 1 ? 'seat' : 'seats'}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-light leading-tight tracking-tight md:text-4xl">
          {title}
        </h1>
        {roleId !== undefined &&
        temperatureCheckId !== undefined &&
        parameterSetId !== undefined &&
        parameterSetVersion !== undefined ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>Role {roleId}</span>
            <Link
              to="/tc/$id"
              params={{ id: String(temperatureCheckId) }}
              className="underline underline-offset-4"
            >
              Candidate-list TC #{temperatureCheckId}
            </Link>
            <span>
              {parameterSetId} v{parameterSetVersion}
            </span>
          </div>
        ) : null}
        <div className="mt-5 border-l-2 border-foreground pl-3 text-sm font-medium">
          {currentStatusCopy}
        </div>
        {tcVotingStart !== undefined &&
        tcVotingEnd !== undefined &&
        votingStart !== undefined &&
        votingEnd !== undefined ? (
          <div className="mt-5 grid gap-x-8 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2">
            <span>
              TC: {dateTime(tcVotingStart)}–{dateTime(tcVotingEnd)}
            </span>
            <span>
              Voting: {dateTime(votingStart)}–{dateTime(votingEnd)}
            </span>
            {status === 'PENDING' ? (
              <Countdown
                label="Candidate-list voting opens"
                target={tcVotingStart}
              />
            ) : null}
            {tcVotingOpen && tcVotingEnd !== undefined ? (
              <Countdown label="TC voting closes" target={tcVotingEnd} />
            ) : null}
            {status === 'MJ_PENDING' ? (
              <Countdown label="MJ grading opens" target={votingStart} />
            ) : null}
            {votingOpen ? (
              <Countdown label="Voting closes" target={votingEnd} />
            ) : null}
          </div>
        ) : null}
        {status === 'RERUN_LIVE' ? (
          <p className="mt-4 text-sm text-muted-foreground">
            This rerun uses the same quorum and grade floor as Round 1. Minimum
            majority grade: {gradeName(minimumMedianGrade)}.
          </p>
        ) : null}
      </header>

      <section aria-label="Candidates">
        <div>
          <h2 className="text-xl font-medium">Candidates</h2>
          <p className="text-sm text-muted-foreground">
            {liveStatus
              ? 'Grade every candidate. The recorded display order is immutable.'
              : 'This is the immutable candidate list committed when the election and its Temperature Check were created.'}
          </p>
        </div>
        <div className="mt-5 divide-y divide-border border-y border-border">
          {candidates.map((candidate) => {
            const candidateResult = resultByCandidate.get(candidate.id)
            return (
              <article key={candidate.id} className="py-6 first:pt-5 last:pb-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:justify-between">
                  <div className="min-w-0 space-y-2 sm:max-w-xl">
                    <h3 className="font-medium">{candidate.displayName}</h3>
                    {candidate.reference ? (
                      <p className="text-xs text-muted-foreground">
                        {candidate.reference}
                      </p>
                    ) : null}
                    <p className="text-sm whitespace-pre-wrap">
                      {candidate.description}
                    </p>
                    {candidate.links.length > 0 ? (
                      <ul className="flex flex-wrap gap-3 text-sm">
                        {candidate.links.map((link) => (
                          <li key={link}>
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-4"
                            >
                              Candidate profile
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <fieldset
                    className="grid gap-2 sm:w-72"
                    disabled={!votingOpen || submitting}
                  >
                    <legend className="sr-only">
                      Grade {candidate.displayName}
                    </legend>
                    {grades.map((grade) => (
                      <label
                        key={grade}
                        className="flex cursor-pointer items-center gap-2 border px-3 py-2 text-sm transition-colors has-[:checked]:border-foreground has-[:checked]:bg-secondary/70 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                      >
                        <input
                          type="radio"
                          name={`candidate-${candidate.id}`}
                          value={grade}
                          disabled={!votingOpen || submitting}
                          checked={selectedGrades.get(candidate.id) === grade}
                          onChange={() =>
                            setSelectedGrades((current) => {
                              const next = new Map(current)
                              next.set(candidate.id, grade)
                              return next
                            })
                          }
                        />
                        {gradeName(grade)}
                      </label>
                    ))}
                  </fieldset>
                </div>
                {candidateResult ? (
                  <div className="mt-5 grid gap-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
                    <p>
                      Majority grade:{' '}
                      {candidateResult.majorityGrade === null ||
                      candidateResult.majorityGrade === undefined
                        ? 'None'
                        : gradeName(candidateResult.majorityGrade)}
                    </p>
                    {candidateResult.finalMajorityGrade !== null &&
                    candidateResult.finalMajorityGrade !== undefined &&
                    candidateResult.finalMajorityGrade !==
                      candidateResult.majorityGrade ? (
                      <p>
                        Tie-adjusted grade:{' '}
                        {gradeName(candidateResult.finalMajorityGrade)}
                      </p>
                    ) : null}
                    <p>
                      {outcomeCopy(candidateResult.outcome)}
                      {candidateResult.rank && result?.quorumMet !== false
                        ? ` · Rank ${candidateResult.rank}`
                        : ''}
                    </p>
                    <p>
                      Grade floor: {gradeName(minimumMedianGrade)} ·{' '}
                      {candidateResult.electable
                        ? 'Meets grade floor'
                        : 'Below grade floor'}
                    </p>
                    {candidateResult.histogram ? (
                      <div className="grid grid-cols-5 gap-1 text-xs text-muted-foreground">
                        {grades.map((grade) => (
                          <span key={gradeName(grade)}>
                            {gradeName(grade)}:{' '}
                            {candidateResult.histogram?.[grade] ?? '0'}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </section>

      {/* Turnout is only meaningful once a round is open or has been tallied.
          Before voting opens there are no ballots, and rendering "0 / quorum"
          would read as zero participation rather than as voting not having
          started. */}
      {votingOpen || result ? (
        <section className="border border-border bg-secondary/50 p-6">
          <div className="space-y-3">
            <p className="font-medium">
              {totalVotingPower} / {quorumXrd} XRD
            </p>
            <p className="text-sm text-muted-foreground">
              Valid XRD-equivalent participation against the fixed quorum.
            </p>
            {votingOpen ? (
              <>
                <p className="text-sm">
                  {remaining === 0
                    ? priorBallot
                      ? 'This submission will replace your earlier ballot.'
                      : 'Every candidate has a grade.'
                    : `${remaining} ${
                        remaining === 1
                          ? 'candidate still needs'
                          : 'candidates still need'
                      } a grade`}
                </p>
                <Button
                  type="button"
                  onClick={submit}
                  disabled={remaining > 0 || submitting}
                >
                  {submitting
                    ? 'Submitting…'
                    : priorBallot
                      ? 'Replace ballot'
                      : 'Submit ballot'}
                </Button>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="space-y-2">
          <h2 className="text-xl font-medium">
            {status === 'LIVE' || status === 'RERUN_LIVE'
              ? 'Provisional results'
              : 'Election result details'}
          </h2>
          {result.tieBreakIterations > 0 ? (
            <p className="text-sm text-muted-foreground">
              Deterministic tie-break used {result.tieBreakIterations}{' '}
              {result.tieBreakIterations === 1 ? 'iteration' : 'iterations'}.
            </p>
          ) : null}
          {status === 'TIE_UNRESOLVED' ? (
            <p className="text-sm text-muted-foreground">
              The consequential tie must be resolved under the adopted
              governance process and recorded on-ledger.
            </p>
          ) : null}
          {status === 'FAILED' ? (
            <p className="text-sm text-muted-foreground">
              No candidate is elected; all seats return to the applicable
              vacancy or founding-election process.{' '}
              <Link to="/about" className="underline underline-offset-4">
                Read the governance policy
              </Link>
              .
            </p>
          ) : null}
          {status === 'ROUND_1_FAILED' ? (
            <p className="text-sm text-muted-foreground">
              Turnout was below quorum. The election remains closed unless the
              RAC opens a Round 2 rerun.
            </p>
          ) : null}
          {status === 'FINAL' &&
          result.candidateResults.filter(({ outcome }) => outcome === 'SEATED')
            .length < seatCount ? (
            <p className="text-sm text-muted-foreground">
              Unfilled seats return to the applicable vacancy or
              founding-election process.{' '}
              <Link to="/about" className="underline underline-offset-4">
                Read the governance policy
              </Link>
              .
            </p>
          ) : null}
        </section>
      ) : null}

      {historicalResults.length > 0 ? (
        <section className="space-y-3" aria-label="Round audit history">
          <div>
            <h2 className="text-xl font-medium">Round audit history</h2>
            <p className="text-sm text-muted-foreground">
              Published tallies remain visible after a rerun opens.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {historicalResults.map((historicalResult) => (
              <Card key={historicalResult.round}>
                <CardContent className="space-y-2 pt-6 text-sm">
                  <p className="font-medium">
                    {historicalResult.round === 'RoundOne'
                      ? 'Round 1'
                      : 'Round 2 rerun'}
                  </p>
                  <p>{statusCopy(historicalResult.status)}</p>
                  <p className="text-muted-foreground">
                    {historicalResult.totalVotingPower} /{' '}
                    {historicalResult.quorumXrd} XRD ·{' '}
                    {historicalResult.quorumMet ? 'quorum met' : 'below quorum'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
