import { assert, describe, it } from '@effect/vitest'
import {
  Governance,
  GovernanceProcessParameters,
  Grade,
  MajorityJudgmentElectionCreatedEvent,
  MajorityJudgmentElectionKeyValueStoreValue,
  MajorityJudgmentElectionVotedEvent,
  MajorityJudgmentRerunStartedEvent,
  MajorityJudgmentTieResolutionRecordedEvent,
  MajorityJudgmentVoteKeyValueStoreValue,
  MajorityJudgmentVotersKeyValueStoreValue
} from '../schemas'

const number = (fieldName: string, value: number, kind = 'U32') => ({
  kind,
  field_name: fieldName,
  value: value.toString()
})

const instant = (fieldName: string, value: number) => ({
  kind: 'I64',
  type_name: 'Instant',
  field_name: fieldName,
  value: value.toString()
})

const grade = (fieldName: string, variantName: string, variantId: number) => ({
  kind: 'Enum',
  type_name: 'Grade',
  field_name: fieldName,
  variant_name: variantName,
  variant_id: variantId,
  fields: []
})

const candidateId = (fieldName: string, value: number) => ({
  kind: 'Tuple',
  type_name: 'MajorityJudgmentCandidateId',
  field_name: fieldName,
  fields: [number('0', value)]
})

const candidateGrade = (
  candidate: number,
  gradeName: string,
  score: number
) => ({
  kind: 'Tuple',
  type_name: 'CandidateGrade',
  fields: [
    candidateId('candidate_id', candidate),
    grade('grade', gradeName, score)
  ]
})

const roundId = (
  fieldName: string,
  variantName: string,
  variantId: number
) => ({
  kind: 'Enum',
  type_name: 'MajorityJudgmentRoundId',
  field_name: fieldName,
  variant_name: variantName,
  variant_id: variantId,
  fields: []
})

const temperatureCheckParameters = {
  kind: 'Tuple',
  type_name: 'TemperatureCheckParameters',
  field_name: 'temperature_check',
  fields: [
    number('voting_days', 7),
    { kind: 'Decimal', field_name: 'quorum', value: '1000000' },
    { kind: 'Decimal', field_name: 'approval_threshold', value: '0.5' }
  ]
}

const electionParameters = {
  kind: 'Tuple',
  type_name: 'MajorityJudgmentParameters',
  field_name: 'election',
  fields: [
    number('review_days', 7),
    number('voting_days', 7),
    { kind: 'Decimal', field_name: 'quorum', value: '1000000' },
    grade('minimum_median_grade', 'Good', 2),
    number('rerun_voting_days', 5),
    { kind: 'Decimal', field_name: 'rerun_quorum', value: '500000' },
    grade('rerun_minimum_median_grade', 'VeryGood', 3),
    number('reserve_list_days', 90)
  ]
}

const parameterSnapshot = {
  kind: 'Tuple',
  type_name: 'GovernanceParameterSetSnapshot',
  field_name: 'parameter_set',
  fields: [
    { kind: 'String', field_name: 'id', value: 'mj-rac' },
    { kind: 'String', field_name: 'label', value: 'RAC election' },
    number('version', 1),
    {
      kind: 'Enum',
      type_name: 'GovernanceProcessParameters',
      field_name: 'parameters',
      variant_name: 'MajorityJudgment',
      variant_id: 1,
      fields: [temperatureCheckParameters, electionParameters]
    }
  ]
}

const round = {
  kind: 'Tuple',
  type_name: 'MajorityJudgmentRound',
  field_name: 'round_one',
  fields: [
    instant('snapshot', 1_700_000_000),
    instant('start', 1_700_604_800),
    instant('deadline', 1_701_209_600),
    { kind: 'Decimal', field_name: 'quorum', value: '1000000' },
    grade('minimum_median_grade', 'Good', 2),
    {
      kind: 'Own',
      field_name: 'voters',
      value: 'internal_keyvaluestore_voters'
    },
    {
      kind: 'Own',
      field_name: 'votes',
      value: 'internal_keyvaluestore_votes'
    },
    number('vote_count', 1, 'U64'),
    number('revote_count', 0, 'U64')
  ]
}

describe('majority judgment SBOR schemas', () => {
  it('decodes component state and both process variants explicitly', () => {
    const component = Governance.safeParse({
      kind: 'Tuple',
      type_name: 'Governance',
      fields: [
        {
          kind: 'Own',
          field_name: 'parameter_sets',
          value: 'internal_keyvaluestore_parameters'
        },
        {
          kind: 'Own',
          field_name: 'temperature_checks',
          value: 'internal_keyvaluestore_tcs'
        },
        number('temperature_check_count', 2, 'U64'),
        {
          kind: 'Own',
          field_name: 'proposals',
          value: 'internal_keyvaluestore_proposals'
        },
        number('proposal_count', 1, 'U64'),
        {
          kind: 'Own',
          field_name: 'majority_judgment_elections',
          value: 'internal_keyvaluestore_elections'
        },
        number('majority_judgment_election_count', 1, 'U64')
      ]
    })
    const parameters = GovernanceProcessParameters.safeParse({
      kind: 'Enum',
      type_name: 'GovernanceProcessParameters',
      variant_name: 'MajorityJudgment',
      variant_id: 1,
      fields: [temperatureCheckParameters, electionParameters]
    })

    assert.isTrue(component.isOk())
    assert.isTrue(parameters.isOk())
    if (component.isOk() && parameters.isOk()) {
      assert.strictEqual(component.value.majority_judgment_election_count, 1)
      assert.strictEqual(parameters.value.variant, 'MajorityJudgment')
    }
  })

  it('decodes grade, vote, voter, election, and option records', () => {
    const decodedGrade = Grade.safeParse(grade('grade', 'Excellent', 4))
    const vote = MajorityJudgmentVoteKeyValueStoreValue.safeParse({
      kind: 'Tuple',
      type_name: 'MajorityJudgmentVoteRecord',
      fields: [
        {
          kind: 'Reference',
          field_name: 'voter',
          value: 'account_tdx_2_voter'
        },
        {
          kind: 'Array',
          field_name: 'grades',
          element_kind: 'Tuple',
          elements: [candidateGrade(0, 'Excellent', 4)]
        },
        {
          kind: 'Enum',
          field_name: 'replacing_vote_id',
          variant_name: 'Some',
          variant_id: 1,
          fields: [number('0', 0, 'U64')]
        }
      ]
    })
    const voter = MajorityJudgmentVotersKeyValueStoreValue.safeParse({
      kind: 'Tuple',
      type_name: 'MajorityJudgmentVoterEntry',
      fields: [
        number('vote_id', 1, 'U64'),
        {
          kind: 'Array',
          field_name: 'grades',
          element_kind: 'Tuple',
          elements: [candidateGrade(0, 'Excellent', 4)]
        }
      ]
    })
    const election = MajorityJudgmentElectionKeyValueStoreValue.safeParse({
      kind: 'Tuple',
      type_name: 'MajorityJudgmentElection',
      fields: [
        number('temperature_check_id', 3, 'U64'),
        { kind: 'String', field_name: 'title', value: 'RAC election' },
        { kind: 'String', field_name: 'short_description', value: 'Elect' },
        { kind: 'String', field_name: 'description', value: 'Profiles' },
        {
          kind: 'Array',
          field_name: 'links',
          element_kind: 'String',
          elements: []
        },
        {
          kind: 'Reference',
          field_name: 'author',
          value: 'account_tdx_2_author'
        },
        { kind: 'String', field_name: 'role_id', value: 'rac-member' },
        number('seat_count', 1),
        {
          kind: 'Array',
          field_name: 'candidates',
          element_kind: 'Tuple',
          elements: [
            {
              kind: 'Tuple',
              type_name: 'MajorityJudgmentCandidate',
              fields: [
                candidateId('id', 0),
                { kind: 'String', field_name: 'reference', value: 'alice' },
                {
                  kind: 'String',
                  field_name: 'display_name',
                  value: 'Alice'
                },
                { kind: 'String', field_name: 'description', value: 'Profile' },
                {
                  kind: 'Array',
                  field_name: 'links',
                  element_kind: 'String',
                  elements: []
                },
                number('display_order', 0)
              ]
            }
          ]
        },
        parameterSnapshot,
        instant('review_start', 1_700_000_000),
        instant('review_end', 1_700_604_800),
        round,
        {
          kind: 'Enum',
          field_name: 'rerun',
          variant_name: 'None',
          variant_id: 0,
          fields: []
        },
        {
          kind: 'Enum',
          field_name: 'tie_resolution',
          variant_name: 'None',
          variant_id: 0,
          fields: []
        },
        { kind: 'Bool', field_name: 'hidden', value: false }
      ]
    })

    assert.isTrue(decodedGrade.isOk())
    assert.isTrue(vote.isOk())
    assert.isTrue(voter.isOk())
    assert.isTrue(election.isOk())
  })

  it('decodes every majority judgment event and rejects malformed payloads', () => {
    const created = MajorityJudgmentElectionCreatedEvent.safeParse({
      kind: 'Tuple',
      type_name: 'MajorityJudgmentElectionCreatedEvent',
      fields: [
        number('election_id', 7, 'U64'),
        number('temperature_check_id', 3, 'U64'),
        { kind: 'String', field_name: 'role_id', value: 'rac-member' },
        number('seat_count', 1),
        instant('review_start', 1_700_000_000),
        instant('review_end', 1_700_604_800),
        instant('snapshot', 1_699_000_000),
        instant('voting_start', 1_700_604_800),
        instant('voting_deadline', 1_701_209_600),
        { kind: 'String', field_name: 'parameter_set_id', value: 'mj-rac' },
        number('parameter_set_version', 1)
      ]
    })
    const voted = MajorityJudgmentElectionVotedEvent.safeParse({
      kind: 'Tuple',
      type_name: 'MajorityJudgmentElectionVotedEvent',
      fields: [
        number('election_id', 7, 'U64'),
        roundId('round', 'RoundOne', 0),
        number('vote_id', 1, 'U64'),
        {
          kind: 'Reference',
          field_name: 'account',
          value: 'account_tdx_2_voter'
        },
        {
          kind: 'Array',
          field_name: 'grades',
          element_kind: 'Tuple',
          elements: [candidateGrade(0, 'Good', 2)]
        },
        {
          kind: 'Enum',
          field_name: 'replacing_vote_id',
          variant_name: 'None',
          variant_id: 0,
          fields: []
        }
      ]
    })
    const rerun = MajorityJudgmentRerunStartedEvent.safeParse({
      kind: 'Tuple',
      type_name: 'MajorityJudgmentRerunStartedEvent',
      fields: [
        number('election_id', 7, 'U64'),
        instant('snapshot', 1_702_000_000),
        instant('start', 1_702_100_000),
        instant('deadline', 1_702_532_000),
        { kind: 'Decimal', field_name: 'quorum', value: '500000' },
        grade('minimum_median_grade', 'VeryGood', 3)
      ]
    })
    const tie = MajorityJudgmentTieResolutionRecordedEvent.safeParse({
      kind: 'Tuple',
      type_name: 'MajorityJudgmentTieResolutionRecordedEvent',
      fields: [
        number('election_id', 7, 'U64'),
        roundId('round', 'RoundOne', 0),
        {
          kind: 'Array',
          field_name: 'ordered_candidate_ids',
          element_kind: 'Tuple',
          elements: [candidateId('0', 0), candidateId('1', 1)]
        },
        instant('recorded_at', 1_702_000_000)
      ]
    })

    assert.isTrue(created.isOk())
    assert.isTrue(voted.isOk())
    assert.isTrue(rerun.isOk())
    assert.isTrue(tie.isOk())
    assert.isTrue(
      MajorityJudgmentElectionVotedEvent.safeParse({
        kind: 'Tuple',
        type_name: 'MajorityJudgmentElectionVotedEvent',
        fields: [number('election_id', 7, 'U64')]
      }).isErr()
    )
  })
})
