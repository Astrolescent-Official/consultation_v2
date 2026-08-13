import {
  mjAccountBallot,
  mjCandidate,
  mjElection,
  mjGradeHistogram,
  mjResult,
  mjRound
} from 'db/src/schema'
import { getTableName } from 'drizzle-orm'
import { assert, describe, it } from 'vitest'

describe('majority judgment database schema', () => {
  it('defines the six coordinated persistence tables', () => {
    assert.deepStrictEqual(
      [
        mjElection,
        mjCandidate,
        mjRound,
        mjAccountBallot,
        mjGradeHistogram,
        mjResult
      ].map(getTableName),
      [
        'mj_election',
        'mj_candidate',
        'mj_round',
        'mj_account_ballot',
        'mj_grade_histogram',
        'mj_result'
      ]
    )
  })

  it('keeps decimal voting power in numeric columns and JSON at typed boundaries', () => {
    assert.strictEqual(mjRound.quorumXrd.dataType, 'string')
    assert.strictEqual(mjAccountBallot.votingPower.dataType, 'string')
    assert.strictEqual(mjGradeHistogram.votingPower.dataType, 'string')
    assert.strictEqual(mjResult.totalVotingPower.dataType, 'string')
    assert.strictEqual(mjAccountBallot.grades.dataType, 'json')
    assert.strictEqual(mjResult.candidateResults.dataType, 'json')
  })

  it('models round-local and account-local composite identities', () => {
    assert.strictEqual(mjRound.electionId.notNull, true)
    assert.strictEqual(mjRound.round.notNull, true)
    assert.strictEqual(mjAccountBallot.electionId.notNull, true)
    assert.strictEqual(mjAccountBallot.round.notNull, true)
    assert.strictEqual(mjAccountBallot.accountAddress.notNull, true)
    assert.strictEqual(mjGradeHistogram.candidateId.notNull, true)
    assert.strictEqual(mjGradeHistogram.grade.notNull, true)
  })
})
