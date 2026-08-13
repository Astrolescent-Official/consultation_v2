import BigNumber from 'bignumber.js'
import { GRADE_QUANTILE, type GradeQuantile } from 'shared/governance/index'

export type Grade = 0 | 1 | 2 | 3 | 4
export type RoundId = 'RoundOne' | 'Rerun'
export type GaugeBand = 'A' | 'B' | 'C'
type CandidateOutcome = 'SEATED' | 'RESERVE' | 'NOT_ELECTABLE' | 'UNRESOLVED'
type GradeHistogram = readonly [string, string, string, string, string]

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
  readonly gradeQuantile: GradeQuantile
  readonly reserveListDays: number
  readonly roundEndsAt: Date
  readonly round?: RoundId
}

type ValidBallot = {
  readonly accountAddress: string
  readonly voteId: number
  readonly votingPower: string
  readonly grades: ReadonlyMap<number, Grade>
}

type CandidateGauge = {
  readonly id: number
  readonly histogram: GradeHistogram
  readonly qualifyingGrade: Grade | null
  readonly powerAbove: BigNumber
  readonly powerBelow: BigNumber
  readonly band: GaugeBand | null
}

type RankedCandidate = CandidateGauge & {
  readonly rank: number
  readonly tieGroupId: number | null
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

const qualifyingGradeFromHistogram = (
  histogram: GradeHistogram,
  quantile: GradeQuantile
): Grade | null => {
  const total = histogram.reduce(
    (sum, votingPower) => sum.plus(votingPower),
    new BigNumber(0)
  )
  if (total.isZero()) return null

  const threshold = total.multipliedBy(quantile.num)
  let cumulative = new BigNumber(0)
  for (const grade of gradesDescending) {
    cumulative = cumulative.plus(histogram[grade])
    if (
      cumulative.multipliedBy(quantile.den).isGreaterThanOrEqualTo(threshold)
    ) {
      return grade
    }
  }
  throw new Error('Unreachable: Poor always satisfies the grade quantile')
}

export const majorityGrade = (
  contributions: ReadonlyArray<{
    readonly grade: number
    readonly votingPower: string
  }>
): Grade | null => {
  const weights = [
    new BigNumber(0),
    new BigNumber(0),
    new BigNumber(0),
    new BigNumber(0),
    new BigNumber(0)
  ]
  for (const contribution of contributions) {
    const grade = requireGrade(contribution.grade)
    weights[grade] = weights[grade].plus(contribution.votingPower)
  }
  return qualifyingGradeFromHistogram(
    [
      weights[0].toFixed(),
      weights[1].toFixed(),
      weights[2].toFixed(),
      weights[3].toFixed(),
      weights[4].toFixed()
    ],
    GRADE_QUANTILE
  )
}

const validBallot = (
  ballot: MajorityJudgmentBallot,
  candidateIds: ReadonlySet<number>
): ValidBallot | null => {
  if (!new BigNumber(ballot.votingPower).isGreaterThan(0)) return null
  if (ballot.grades.length !== candidateIds.size) return null

  const grades = new Map<number, Grade>()
  for (const entry of ballot.grades) {
    if (
      !candidateIds.has(entry.candidateId) ||
      !isGrade(entry.grade) ||
      grades.has(entry.candidateId)
    ) {
      return null
    }
    grades.set(entry.candidateId, entry.grade)
  }
  if ([...candidateIds].some((candidateId) => !grades.has(candidateId))) {
    return null
  }
  return { ...ballot, grades }
}

const histogramForCandidate = (
  candidateId: number,
  ballots: ReadonlyArray<ValidBallot>
): GradeHistogram => {
  const weights = [
    new BigNumber(0),
    new BigNumber(0),
    new BigNumber(0),
    new BigNumber(0),
    new BigNumber(0)
  ]
  for (const ballot of ballots) {
    const grade = ballot.grades.get(candidateId)
    if (grade === undefined) {
      throw new Error(`Validated ballot is missing candidate ${candidateId}`)
    }
    weights[grade] = weights[grade].plus(ballot.votingPower)
  }
  return [
    weights[0].toFixed(),
    weights[1].toFixed(),
    weights[2].toFixed(),
    weights[3].toFixed(),
    weights[4].toFixed()
  ]
}

const candidateGauge = (
  id: number,
  histogram: GradeHistogram,
  gradeQuantile: GradeQuantile
): CandidateGauge => {
  const qualifyingGrade = qualifyingGradeFromHistogram(histogram, gradeQuantile)
  if (qualifyingGrade === null) {
    return {
      id,
      histogram,
      qualifyingGrade,
      powerAbove: new BigNumber(0),
      powerBelow: new BigNumber(0),
      band: null
    }
  }
  const powerAbove = histogram.reduce(
    (sum, votingPower, grade) =>
      grade > qualifyingGrade ? sum.plus(votingPower) : sum,
    new BigNumber(0)
  )
  const powerBelow = histogram.reduce(
    (sum, votingPower, grade) =>
      grade < qualifyingGrade ? sum.plus(votingPower) : sum,
    new BigNumber(0)
  )
  const comparison = powerAbove.comparedTo(powerBelow) ?? 0
  return {
    id,
    histogram,
    qualifyingGrade,
    powerAbove,
    powerBelow,
    band: comparison > 0 ? 'A' : comparison < 0 ? 'C' : 'B'
  }
}

const bandOrder: Record<GaugeBand, number> = { A: 0, B: 1, C: 2 }

const compareCandidateGauges = (
  left: CandidateGauge,
  right: CandidateGauge
) => {
  if (left.qualifyingGrade !== right.qualifyingGrade) {
    if (left.qualifyingGrade === null) return 1
    if (right.qualifyingGrade === null) return -1
    return right.qualifyingGrade - left.qualifyingGrade
  }
  if (left.band !== right.band) {
    if (left.band === null) return 1
    if (right.band === null) return -1
    return bandOrder[left.band] - bandOrder[right.band]
  }
  if (left.band === 'A') {
    return right.powerAbove.comparedTo(left.powerAbove) ?? 0
  }
  if (left.band === 'C') {
    return left.powerBelow.comparedTo(right.powerBelow) ?? 0
  }
  // Band B, equal-p band A, and equal-q band C remain genuinely tied. Candidate
  // ID must never become a silent mechanism-level tiebreaker.
  return 0
}

const rankCandidates = (
  electable: ReadonlyArray<CandidateGauge>
): ReadonlyArray<RankedCandidate> => {
  const ordered = [...electable].sort(compareCandidateGauges)
  const ranked: Array<RankedCandidate> = []
  let tieGroupId = 0
  for (let start = 0; start < ordered.length; ) {
    let end = start + 1
    while (
      end < ordered.length &&
      compareCandidateGauges(
        ordered[start] as CandidateGauge,
        ordered[end] as CandidateGauge
      ) === 0
    ) {
      end += 1
    }
    const tied = end - start > 1
    const groupId = tied ? ++tieGroupId : null
    for (let index = start; index < end; index += 1) {
      const candidate = ordered[index]
      if (candidate === undefined) continue
      ranked.push({
        ...candidate,
        rank: start + 1,
        tieGroupId: groupId
      })
    }
    start = end
  }
  return ranked
}

const reserveExpiry = (roundEndsAt: Date, reserveListDays: number) =>
  new Date(roundEndsAt.getTime() + reserveListDays * 24 * 60 * 60 * 1000)

export const calculateMajorityJudgment = (
  input: MajorityJudgmentCalculationInput
) => {
  const round = input.round ?? 'RoundOne'
  const sortedCandidates = [...input.candidates].sort(
    (left, right) => left.id - right.id
  )
  const candidateIds = new Set(sortedCandidates.map(({ id }) => id))
  const positiveBallots = [...input.ballots]
    .sort(
      (left, right) =>
        compareStrings(left.accountAddress, right.accountAddress) ||
        left.voteId - right.voteId
    )
    .flatMap((ballot) => {
      const validated = validBallot(ballot, candidateIds)
      if (validated !== null) return [validated]
      if (new BigNumber(ballot.votingPower).isGreaterThan(0)) {
        console.warn(
          `Excluding invalid Majority Judgment ballot ${ballot.voteId} from ${ballot.accountAddress}`
        )
      }
      return []
    })

  const totalVotingPowerNumber = positiveBallots.reduce(
    (sum, ballot) => sum.plus(ballot.votingPower),
    new BigNumber(0)
  )
  const totalVotingPower = totalVotingPowerNumber.toFixed()
  const quorumMet = totalVotingPowerNumber.isGreaterThanOrEqualTo(
    input.quorumXrd
  )
  const minimumMedianGrade = requireGrade(input.minimumMedianGrade)
  const workingCandidates = sortedCandidates.map(({ id }) =>
    candidateGauge(
      id,
      histogramForCandidate(id, positiveBallots),
      input.gradeQuantile
    )
  )
  const electable = rankCandidates(
    workingCandidates.filter(
      ({ qualifyingGrade }) =>
        qualifyingGrade !== null && qualifyingGrade >= minimumMedianGrade
    )
  )

  const boundaryGroups = electable
    .filter(({ tieGroupId }) => tieGroupId !== null)
    .reduce<Array<ReadonlyArray<RankedCandidate>>>((groups, candidate) => {
      const previous = groups.at(-1)
      if (previous?.[0]?.tieGroupId === candidate.tieGroupId) {
        groups[groups.length - 1] = [...previous, candidate]
      } else {
        groups.push([candidate])
      }
      return groups
    }, [])
    .filter((group) => {
      const start = electable.indexOf(group[0] as RankedCandidate)
      return start < input.seatCount && start + group.length > input.seatCount
    })
  if (boundaryGroups.length > 1) {
    throw new Error('At most one tie group may straddle the seat boundary')
  }
  const unresolvedGroup =
    quorumMet && input.seatCount > 0 ? boundaryGroups[0] : undefined
  const unresolvedCandidateIds = unresolvedGroup?.map(({ id }) => id) ?? []
  const unresolvedIds = new Set(unresolvedCandidateIds)
  const seatedCandidateIds = quorumMet
    ? electable
        .slice(0, input.seatCount)
        .filter(({ id }) => !unresolvedIds.has(id))
        .map(({ id }) => id)
    : []
  const reserveCandidateIds = quorumMet
    ? electable
        .slice(input.seatCount)
        .filter(({ id }) => !unresolvedIds.has(id))
        .map(({ id }) => id)
    : []
  const unresolved = unresolvedCandidateIds.length > 0
  const status = !quorumMet
    ? round === 'Rerun'
      ? 'FAILED'
      : 'ROUND_1_FAILED'
    : unresolved
      ? 'TIE_UNRESOLVED'
      : 'FINAL'
  const rankedByCandidate = new Map(
    electable.map((candidate) => [candidate.id, candidate])
  )

  const candidateResults = workingCandidates.map((candidate) => {
    const ranked = rankedByCandidate.get(candidate.id)
    const electableCandidate = ranked !== undefined
    const outcome: CandidateOutcome = unresolvedIds.has(candidate.id)
      ? 'UNRESOLVED'
      : seatedCandidateIds.includes(candidate.id)
        ? 'SEATED'
        : reserveCandidateIds.includes(candidate.id)
          ? 'RESERVE'
          : 'NOT_ELECTABLE'
    const share = (power: BigNumber) =>
      totalVotingPowerNumber.isZero()
        ? '0'
        : power.dividedBy(totalVotingPowerNumber).toFixed()

    return {
      candidateId: candidate.id,
      histogram: candidate.histogram,
      qualifyingGrade: candidate.qualifyingGrade,
      powerAbove: candidate.powerAbove.toFixed(),
      powerBelow: candidate.powerBelow.toFixed(),
      p: share(candidate.powerAbove),
      q: share(candidate.powerBelow),
      band: electableCandidate ? candidate.band : null,
      electable: electableCandidate,
      rank: ranked?.rank ?? null,
      tieGroupId: ranked?.tieGroupId ?? null,
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
          (right.rank ?? Number.MAX_SAFE_INTEGER) ||
        left.candidateId - right.candidateId
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
  const resolvedRankByCandidate = new Map(
    resolvedOrder
      .map((candidateId, index) => ({ candidateId, index }))
      .filter(({ candidateId }) => unresolved.has(candidateId))
      .map(({ candidateId, index }) => [candidateId, index + 1])
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
      rank: unresolved.has(candidate.candidateId)
        ? (resolvedRankByCandidate.get(candidate.candidateId) ?? null)
        : candidate.rank,
      tieGroupId: unresolved.has(candidate.candidateId)
        ? null
        : candidate.tieGroupId,
      outcome: resolvedOutcome(candidate.candidateId)
    })),
    seatedCandidateIds,
    reserveCandidateIds,
    reserveExpiresAt: reserveExpiry(input.roundEndsAt, input.reserveListDays),
    referredSeats: input.seatCount - seatedCandidateIds.length,
    unresolvedCandidateIds: []
  }
}
