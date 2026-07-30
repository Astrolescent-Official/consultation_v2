import BigNumber from 'bignumber.js'

export type Grade = 0 | 1 | 2 | 3 | 4
export type RoundId = 'RoundOne' | 'Rerun'
type CandidateOutcome = 'SEATED' | 'RESERVE' | 'NOT_ELECTABLE' | 'UNRESOLVED'

export type GradeContribution = {
  readonly accountAddress: string
  readonly voteId: number
  readonly grade: Grade
  readonly votingPower: string
}

export type MajorityJudgmentBallot = {
  readonly accountAddress: string
  readonly voteId: number
  readonly votingPower: string
  readonly grades: ReadonlyArray<{
    readonly candidateId: number
    readonly grade: number
  }>
}

export type MajorityJudgmentCalculationInput = {
  readonly candidates: ReadonlyArray<{ readonly id: number }>
  readonly ballots: ReadonlyArray<MajorityJudgmentBallot>
  readonly seatCount: number
  readonly quorumXrd: string
  readonly minimumMedianGrade: number
  readonly reserveListDays: number
  readonly roundEndsAt: Date
  readonly round?: RoundId
}

type WorkingCandidate = {
  readonly id: number
  readonly originalMajorityGrade: Grade | null
  readonly contributions: Array<GradeContribution>
  readonly finalMajorityGrade: Grade | null
}

const gradesDescending: ReadonlyArray<Grade> = [4, 3, 2, 1, 0]

const isGrade = (value: number): value is Grade =>
  value === 0 || value === 1 || value === 2 || value === 3 || value === 4

const requireGrade = (value: number): Grade => {
  if (!isGrade(value)) {
    throw new RangeError(`Grade must be an integer from 0 through 4: ${value}`)
  }
  return value
}

const compareStrings = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0

const compareContributions = (
  left: GradeContribution,
  right: GradeContribution
) => {
  const byPower =
    new BigNumber(left.votingPower).comparedTo(right.votingPower) ?? 0
  if (byPower !== 0) return byPower
  const byAccount = compareStrings(left.accountAddress, right.accountAddress)
  return byAccount !== 0 ? byAccount : left.voteId - right.voteId
}

export const selectMedianContribution = (
  contributions: ReadonlyArray<GradeContribution>,
  grade: number
): GradeContribution | undefined =>
  contributions
    .filter((contribution) => contribution.grade === grade)
    .sort(compareContributions)[0]

export const majorityGrade = (
  contributions: ReadonlyArray<{
    readonly grade: number
    readonly votingPower: string
  }>
): Grade | null => {
  const total = contributions.reduce(
    (sum, contribution) => sum.plus(contribution.votingPower),
    new BigNumber(0)
  )
  if (total.isZero()) return null

  let cumulative = new BigNumber(0)
  for (const grade of gradesDescending) {
    cumulative = contributions
      .filter((contribution) => requireGrade(contribution.grade) === grade)
      .reduce(
        (sum, contribution) => sum.plus(contribution.votingPower),
        cumulative
      )
    if (cumulative.multipliedBy(2).isGreaterThanOrEqualTo(total)) return grade
  }
  return null
}

const histogram = (
  contributions: ReadonlyArray<GradeContribution>
): readonly [string, string, string, string, string] => {
  const values = [0, 1, 2, 3, 4].map((grade) =>
    contributions
      .filter((contribution) => contribution.grade === grade)
      .reduce(
        (sum, contribution) => sum.plus(contribution.votingPower),
        new BigNumber(0)
      )
      .toFixed()
  )
  return [values[0], values[1], values[2], values[3], values[4]]
}

const candidateContributions = (
  candidateId: number,
  ballots: ReadonlyArray<MajorityJudgmentBallot>
) =>
  ballots.map((ballot) => {
    const candidateGrades = ballot.grades.filter(
      (candidateGrade) => candidateGrade.candidateId === candidateId
    )
    if (candidateGrades.length !== 1) {
      throw new Error(
        `Ballot ${ballot.voteId} must contain exactly one grade for candidate ${candidateId}`
      )
    }
    const candidateGrade = candidateGrades[0]
    if (candidateGrade === undefined) {
      throw new Error(`Missing grade for candidate ${candidateId}`)
    }
    return {
      accountAddress: ballot.accountAddress,
      voteId: ballot.voteId,
      votingPower: ballot.votingPower,
      grade: requireGrade(candidateGrade.grade)
    }
  })

const compareWorkingCandidates = (
  left: WorkingCandidate,
  right: WorkingCandidate
) => {
  const leftGrade = left.finalMajorityGrade
  const rightGrade = right.finalMajorityGrade
  if (leftGrade === rightGrade) return left.id - right.id
  if (leftGrade === null) return 1
  if (rightGrade === null) return -1
  return rightGrade - leftGrade
}

type ContributionBuckets = [
  Array<GradeContribution>,
  Array<GradeContribution>,
  Array<GradeContribution>,
  Array<GradeContribution>,
  Array<GradeContribution>
]

type GradeWeights = [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber]

type TieCandidate = {
  readonly candidate: WorkingCandidate
  readonly buckets: ContributionBuckets
  readonly next: [number, number, number, number, number]
  readonly weights: GradeWeights
  total: BigNumber
  majority: Grade | null
}

const majorityGradeFromWeights = (
  weights: GradeWeights,
  total: BigNumber
): Grade | null => {
  if (total.isZero()) return null
  let cumulative = new BigNumber(0)
  for (const grade of gradesDescending) {
    cumulative = cumulative.plus(weights[grade])
    if (cumulative.multipliedBy(2).isGreaterThanOrEqualTo(total)) {
      return grade
    }
  }
  return null
}

const makeTieCandidate = (candidate: WorkingCandidate): TieCandidate => {
  const buckets: ContributionBuckets = [[], [], [], [], []]
  const weights: GradeWeights = [
    new BigNumber(0),
    new BigNumber(0),
    new BigNumber(0),
    new BigNumber(0),
    new BigNumber(0)
  ]
  let total = new BigNumber(0)
  for (const contribution of candidate.contributions) {
    buckets[contribution.grade].push(contribution)
    weights[contribution.grade] = weights[contribution.grade].plus(
      contribution.votingPower
    )
    total = total.plus(contribution.votingPower)
  }
  for (const bucket of buckets) bucket.sort(compareContributions)
  return {
    candidate,
    buckets,
    next: [0, 0, 0, 0, 0],
    weights,
    total,
    majority: majorityGradeFromWeights(weights, total)
  }
}

const rankedTieCandidates = (candidates: ReadonlyArray<TieCandidate>) =>
  [...candidates].sort((left, right) => {
    if (left.majority === right.majority) {
      return left.candidate.id - right.candidate.id
    }
    if (left.majority === null) return 1
    if (right.majority === null) return -1
    return right.majority - left.majority
  })

const removeMedianContribution = (candidate: TieCandidate) => {
  const grade = candidate.majority
  if (grade === null) return false
  const contribution = candidate.buckets[grade][candidate.next[grade]]
  if (contribution === undefined) return false
  candidate.next[grade] += 1
  const power = new BigNumber(contribution.votingPower)
  candidate.weights[grade] = candidate.weights[grade].minus(power)
  candidate.total = candidate.total.minus(power)
  candidate.majority = majorityGradeFromWeights(
    candidate.weights,
    candidate.total
  )
  return true
}

const resolveBoundaryTie = (
  candidates: ReadonlyArray<WorkingCandidate>,
  seatsAvailable: number
) => {
  let active = [...candidates]
    .sort((left, right) => left.id - right.id)
    .map(makeTieCandidate)
  let activeSeats = seatsAvailable
  const decidedAbove: Array<TieCandidate> = []
  const decidedBelow: Array<TieCandidate> = []
  const finish = () =>
    [...decidedAbove, ...rankedTieCandidates(active), ...decidedBelow].map(
      ({ candidate, majority }) => ({
        ...candidate,
        finalMajorityGrade: majority
      })
    )

  let iterations = 0
  while (true) {
    const ordered = rankedTieCandidates(active)
    const lastWinner = ordered[activeSeats - 1]
    const firstReserve = ordered[activeSeats]
    const lastWinnerGrade = lastWinner?.majority ?? null
    const firstReserveGrade = firstReserve?.majority ?? null

    if (
      firstReserve === undefined ||
      (lastWinnerGrade ?? -1) > (firstReserveGrade ?? -1)
    ) {
      return {
        ordered: finish(),
        iterations,
        unresolvedCandidateIds: []
      }
    }

    const separatedAbove = ordered.filter(({ majority }) =>
      lastWinnerGrade === null
        ? false
        : majority !== null && majority > lastWinnerGrade
    )
    const separatedBelow = ordered.filter(({ majority }) =>
      lastWinnerGrade === null
        ? false
        : majority === null || majority < lastWinnerGrade
    )
    if (separatedAbove.length > 0 || separatedBelow.length > 0) {
      const boundary = ordered.filter(
        ({ majority }) => majority === lastWinnerGrade
      )
      // Candidates that have separated from the seat boundary are decided.
      // Continuing to remove their contributions can make them converge again
      // after exhaustion and incorrectly expand a later unresolved group.
      decidedAbove.push(...separatedAbove)
      decidedBelow.unshift(...separatedBelow)
      active = boundary
      activeSeats -= separatedAbove.length
      continue
    }

    let removed = 0
    for (const candidate of active) {
      if (removeMedianContribution(candidate)) removed += 1
    }
    if (removed === 0) {
      return {
        ordered: finish(),
        iterations,
        unresolvedCandidateIds: ordered.map(({ candidate }) => candidate.id)
      }
    }
    iterations += 1

    if (active.every((candidate) => candidate.total.isZero())) {
      return {
        ordered: finish(),
        iterations,
        unresolvedCandidateIds: active.map(({ candidate }) => candidate.id)
      }
    }
  }
}

const reserveExpiry = (roundEndsAt: Date, reserveListDays: number) =>
  new Date(roundEndsAt.getTime() + reserveListDays * 24 * 60 * 60 * 1000)

export const calculateMajorityJudgment = (
  input: MajorityJudgmentCalculationInput
) => {
  const round = input.round ?? 'RoundOne'
  const positiveBallots = [...input.ballots]
    .filter((ballot) => new BigNumber(ballot.votingPower).isGreaterThan(0))
    .sort(
      (left, right) =>
        compareStrings(left.accountAddress, right.accountAddress) ||
        left.voteId - right.voteId
    )

  const totalVotingPower = positiveBallots
    .reduce((sum, ballot) => sum.plus(ballot.votingPower), new BigNumber(0))
    .toFixed()
  const quorumMet = new BigNumber(totalVotingPower).isGreaterThanOrEqualTo(
    input.quorumXrd
  )
  const minimumMedianGrade = requireGrade(input.minimumMedianGrade)

  const workingCandidates = [...input.candidates]
    .sort((left, right) => left.id - right.id)
    .map((candidate) => {
      const contributions = candidateContributions(
        candidate.id,
        positiveBallots
      )
      return {
        id: candidate.id,
        originalMajorityGrade: majorityGrade(contributions),
        contributions,
        finalMajorityGrade: majorityGrade(contributions)
      }
    })

  const electable = workingCandidates
    .filter(
      (candidate) =>
        candidate.originalMajorityGrade !== null &&
        candidate.originalMajorityGrade >= minimumMedianGrade
    )
    .sort(compareWorkingCandidates)

  let orderedElectable = electable
  let tieBreakIterations = 0
  let unresolvedCandidateIds: Array<number> = []

  if (quorumMet && input.seatCount > 0 && electable.length > input.seatCount) {
    const boundaryGrade =
      electable[input.seatCount - 1]?.originalMajorityGrade ?? null
    const aboveBoundary = electable.filter(
      (candidate) =>
        boundaryGrade !== null &&
        candidate.originalMajorityGrade !== null &&
        candidate.originalMajorityGrade > boundaryGrade
    )
    const boundaryGroup = electable.filter(
      (candidate) => candidate.originalMajorityGrade === boundaryGrade
    )
    const seatsAvailable = input.seatCount - aboveBoundary.length

    if (boundaryGroup.length > seatsAvailable) {
      const resolution = resolveBoundaryTie(boundaryGroup, seatsAvailable)
      orderedElectable = [
        ...aboveBoundary,
        ...resolution.ordered,
        ...electable.filter(
          (candidate) =>
            boundaryGrade !== null &&
            candidate.originalMajorityGrade !== null &&
            candidate.originalMajorityGrade < boundaryGrade
        )
      ]
      tieBreakIterations = resolution.iterations
      unresolvedCandidateIds = resolution.unresolvedCandidateIds
    }
  }

  const unresolved = unresolvedCandidateIds.length > 0
  // The unresolved group always straddles the seat line, so candidates ranked
  // ahead of it have won a seat and candidates ranked behind it are on the
  // reserve list regardless of how the tie is settled. Withholding those
  // outcomes would publish an unambiguous winner as "not elected".
  const unresolvedIds = new Set(unresolvedCandidateIds)
  const decided = (candidates: ReadonlyArray<WorkingCandidate>) =>
    candidates
      .filter((candidate) => !unresolvedIds.has(candidate.id))
      .map((candidate) => candidate.id)
  const seatedCandidateIds = quorumMet
    ? decided(orderedElectable.slice(0, input.seatCount))
    : []
  const reserveCandidateIds = quorumMet
    ? decided(orderedElectable.slice(input.seatCount))
    : []
  const status = !quorumMet
    ? round === 'Rerun'
      ? 'FAILED'
      : 'ROUND_1_FAILED'
    : unresolved
      ? 'TIE_UNRESOLVED'
      : 'FINAL'

  const rankByCandidate = new Map(
    orderedElectable.map((candidate, index) => [candidate.id, index + 1])
  )
  const workingByCandidate = new Map(
    orderedElectable.map((candidate) => [
      candidate.id,
      candidate.finalMajorityGrade
    ])
  )

  const candidateResults = workingCandidates.map((candidate) => {
    const candidateIsElectable =
      candidate.originalMajorityGrade !== null &&
      candidate.originalMajorityGrade >= minimumMedianGrade
    const outcome: CandidateOutcome = unresolvedCandidateIds.includes(
      candidate.id
    )
      ? 'UNRESOLVED'
      : seatedCandidateIds.includes(candidate.id)
        ? 'SEATED'
        : reserveCandidateIds.includes(candidate.id)
          ? 'RESERVE'
          : 'NOT_ELECTABLE'

    return {
      candidateId: candidate.id,
      histogram: histogram(candidate.contributions),
      majorityGrade: candidate.originalMajorityGrade,
      finalMajorityGrade:
        workingByCandidate.get(candidate.id) ?? candidate.originalMajorityGrade,
      electable: candidateIsElectable,
      rank: candidateIsElectable
        ? (rankByCandidate.get(candidate.id) ?? null)
        : null,
      outcome
    }
  })

  return {
    status,
    totalVotingPower,
    quorumXrd: new BigNumber(input.quorumXrd).toFixed(),
    quorumMet,
    minimumMedianGrade,
    candidateResults,
    seatedCandidateIds,
    reserveCandidateIds,
    reserveExpiresAt:
      quorumMet && !unresolved
        ? reserveExpiry(input.roundEndsAt, input.reserveListDays)
        : null,
    // Referral is a terminal determination. While a tie is open the contested
    // seats are pending, not referred to the vacancy process.
    referredSeats: unresolved ? 0 : input.seatCount - seatedCandidateIds.length,
    tieBreakIterations,
    unresolvedCandidateIds
  }
}

export const applyMajorityJudgmentTieResolution = (input: {
  readonly result: ReturnType<typeof calculateMajorityJudgment>
  readonly orderedCandidateIds: ReadonlyArray<number>
  readonly seatCount: number
  readonly roundEndsAt: Date
  readonly reserveListDays: number
}) => {
  const expected = [...input.result.unresolvedCandidateIds].sort(
    (left, right) => left - right
  )
  const supplied = [...input.orderedCandidateIds].sort(
    (left, right) => left - right
  )
  if (
    expected.length === 0 ||
    expected.length !== supplied.length ||
    expected.some((candidateId, index) => candidateId !== supplied[index])
  ) {
    throw new Error(
      'Recorded tie order must contain the exact unresolved candidate group'
    )
  }

  const unresolved = new Set(expected)
  const electableOrder = [...input.result.candidateResults]
    .filter(({ electable }) => electable)
    .sort(
      (left, right) =>
        (left.rank ?? Number.MAX_SAFE_INTEGER) -
        (right.rank ?? Number.MAX_SAFE_INTEGER)
    )
    .map(({ candidateId }) => candidateId)
  let tieIndex = 0
  const resolvedOrder = electableOrder.map((candidateId) => {
    if (!unresolved.has(candidateId)) return candidateId
    const resolvedCandidateId = input.orderedCandidateIds[tieIndex]
    tieIndex += 1
    if (resolvedCandidateId === undefined) {
      throw new Error(
        'Recorded tie order must contain the exact unresolved candidate group'
      )
    }
    return resolvedCandidateId
  })
  const seatedCandidateIds = resolvedOrder.slice(0, input.seatCount)
  const reserveCandidateIds = resolvedOrder.slice(input.seatCount)
  const rankByCandidate = new Map(
    resolvedOrder.map((candidateId, index) => [candidateId, index + 1])
  )
  const resolvedOutcome = (candidateId: number): CandidateOutcome =>
    seatedCandidateIds.includes(candidateId)
      ? 'SEATED'
      : reserveCandidateIds.includes(candidateId)
        ? 'RESERVE'
        : 'NOT_ELECTABLE'

  const status: 'FINAL' = 'FINAL'
  return {
    ...input.result,
    status,
    candidateResults: input.result.candidateResults.map((candidate) => ({
      ...candidate,
      rank: candidate.electable
        ? (rankByCandidate.get(candidate.candidateId) ?? null)
        : null,
      outcome: resolvedOutcome(candidate.candidateId)
    })),
    seatedCandidateIds,
    reserveCandidateIds,
    reserveExpiresAt: reserveExpiry(input.roundEndsAt, input.reserveListDays),
    referredSeats: input.seatCount - seatedCandidateIds.length,
    unresolvedCandidateIds: []
  }
}
