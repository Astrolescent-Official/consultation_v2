import { Schema } from 'effect'
import { assert, describe, it } from 'vitest'
import { msPerGovernanceDurationUnit } from '@/lib/governanceDuration'
import { temperatureCheckFormOpts } from './formOptions'
import {
  makeTemperatureCheckFormSchema,
  TemperatureCheckFormSchema
} from './schema'

const validForm = {
  processType: 'Standard' as const,
  title: 'A proposal',
  shortDescription: 'Summary',
  description: 'Description',
  radixTalkUrl: 'https://radixtalk.com/t/1',
  links: [''],
  voteOptions: [
    { id: 'one', label: 'For' },
    { id: 'two', label: 'Against' }
  ],
  maxSelections: 1,
  roleId: '',
  seatCount: 1,
  candidates: [],
  parameterSetId: 'default',
  tcVotingStart: temperatureCheckFormOpts.defaultValues.tcVotingStart,
  tcVotingEnd: temperatureCheckFormOpts.defaultValues.tcVotingEnd,
  votingStart: temperatureCheckFormOpts.defaultValues.votingStart,
  votingEnd: temperatureCheckFormOpts.defaultValues.votingEnd
}

describe('new temperature check parameter-set selection', () => {
  it('requires a concrete selected parameter-set identifier', () => {
    assert.isTrue(
      Schema.decodeUnknownEither(TemperatureCheckFormSchema)(validForm)._tag ===
        'Right'
    )
    const { parameterSetId: _, ...missingSelection } = validForm
    assert.isTrue(
      Schema.decodeUnknownEither(TemperatureCheckFormSchema)(missingSelection)
        ._tag === 'Left'
    )
  })

  // Only one follow-up editor is rendered at a time, so the other draft keeps
  // the blank rows the form seeds it with. Neither may block submission.
  it('accepts the seeded defaults of the follow-up that is not being edited', () => {
    const filledCommonFields = {
      ...temperatureCheckFormOpts.defaultValues,
      title: 'A proposal',
      shortDescription: 'Summary',
      description: 'Description',
      radixTalkUrl: 'https://radixtalk.com/t/1'
    }

    assert.strictEqual(
      Schema.decodeUnknownEither(TemperatureCheckFormSchema)({
        ...filledCommonFields,
        parameterSetId: 'default',
        voteOptions: [
          { id: 'one', label: 'For' },
          { id: 'two', label: 'Against' }
        ]
      })._tag,
      'Right',
      'a Standard TC must submit with the untouched blank candidate rows'
    )

    assert.strictEqual(
      Schema.decodeUnknownEither(TemperatureCheckFormSchema)({
        ...filledCommonFields,
        processType: 'MajorityJudgment' as const,
        parameterSetId: 'mj-rac',
        roleId: 'rac-member',
        seatCount: 1,
        candidates: [
          {
            id: 'alice',
            reference: 'alice',
            displayName: 'Alice',
            description: 'Alice profile',
            links: []
          },
          {
            id: 'bob',
            reference: 'bob',
            displayName: 'Bob',
            description: 'Bob profile',
            links: []
          }
        ]
      })._tag,
      'Right',
      'an MJ TC must submit with the untouched blank vote-option rows'
    )
  })

  it('validates the committed candidate set for an MJ profile', () => {
    const majorityJudgmentForm = {
      ...validForm,
      processType: 'MajorityJudgment' as const,
      parameterSetId: 'mj-rac',
      roleId: 'rac-member',
      seatCount: 1,
      candidates: [
        {
          id: 'alice',
          reference: 'alice',
          displayName: 'Alice',
          description: 'Alice profile',
          links: ['https://example.com/alice']
        },
        {
          id: 'bob',
          reference: 'bob',
          displayName: 'Bob',
          description: 'Bob profile',
          links: []
        }
      ]
    }
    assert.strictEqual(
      Schema.decodeUnknownEither(TemperatureCheckFormSchema)(
        majorityJudgmentForm
      )._tag,
      'Right'
    )
    assert.strictEqual(
      Schema.decodeUnknownEither(TemperatureCheckFormSchema)({
        ...majorityJudgmentForm,
        seatCount: 2
      })._tag,
      'Right'
    )
    assert.strictEqual(
      Schema.decodeUnknownEither(TemperatureCheckFormSchema)({
        ...majorityJudgmentForm,
        seatCount: 3
      })._tag,
      'Right'
    )
    assert.strictEqual(
      Schema.decodeUnknownEither(TemperatureCheckFormSchema)({
        ...majorityJudgmentForm,
        candidates: [majorityJudgmentForm.candidates[0]]
      })._tag,
      'Right'
    )
    assert.strictEqual(
      Schema.decodeUnknownEither(TemperatureCheckFormSchema)({
        ...majorityJudgmentForm,
        candidates: majorityJudgmentForm.candidates.map((candidate) => ({
          ...candidate,
          reference: 'duplicate'
        }))
      })._tag,
      'Left'
    )
    assert.strictEqual(
      Schema.decodeUnknownEither(TemperatureCheckFormSchema)({
        ...majorityJudgmentForm,
        candidates: majorityJudgmentForm.candidates.map((candidate, index) => ({
          ...candidate,
          links: index === 0 ? ['ftp://example.com/alice'] : candidate.links
        }))
      })._tag,
      'Left'
    )
  })
})

describe('parameter-set-derived duration minimums', () => {
  const localDateTime = (offsetMs: number) => {
    const date = new Date(Date.now() + offsetMs)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16)
  }

  const baseMajorityJudgmentForm = {
    ...temperatureCheckFormOpts.defaultValues,
    processType: 'MajorityJudgment' as const,
    parameterSetId: 'mj-rac',
    title: 'A proposal',
    shortDescription: 'Summary',
    description: 'Description',
    radixTalkUrl: 'https://radixtalk.com/t/1',
    roleId: 'rac-member',
    seatCount: 1,
    candidates: [
      {
        id: 'alice',
        reference: 'alice',
        displayName: 'Alice',
        description: 'Alice profile',
        links: []
      },
      {
        id: 'bob',
        reference: 'bob',
        displayName: 'Bob',
        description: 'Bob profile',
        links: []
      }
    ]
  }

  it('rejects a schedule shorter than the selected parameter set requires', () => {
    const schema = makeTemperatureCheckFormSchema({
      temperatureCheckVotingUnits: 3,
      electionVotingUnits: 2
    })

    const tooShortTc = {
      ...baseMajorityJudgmentForm,
      tcVotingStart: localDateTime(1 * msPerGovernanceDurationUnit),
      // Only 1 unit long, but this parameter set requires 3.
      tcVotingEnd: localDateTime(2 * msPerGovernanceDurationUnit),
      votingStart: localDateTime(3 * msPerGovernanceDurationUnit),
      votingEnd: localDateTime(6 * msPerGovernanceDurationUnit)
    }
    assert.strictEqual(
      Schema.decodeUnknownEither(schema)(tooShortTc)._tag,
      'Left'
    )
  })

  it('accepts a schedule that meets the selected parameter set minimum', () => {
    const schema = makeTemperatureCheckFormSchema({
      temperatureCheckVotingUnits: 3,
      electionVotingUnits: 2
    })

    const validSchedule = {
      ...baseMajorityJudgmentForm,
      tcVotingStart: localDateTime(1 * msPerGovernanceDurationUnit),
      tcVotingEnd: localDateTime(4 * msPerGovernanceDurationUnit),
      votingStart: localDateTime(4 * msPerGovernanceDurationUnit),
      votingEnd: localDateTime(6 * msPerGovernanceDurationUnit)
    }
    assert.strictEqual(
      Schema.decodeUnknownEither(schema)(validSchedule)._tag,
      'Right'
    )
  })

  it('rejects a schedule that meets a looser default but not a stricter parameter set', () => {
    // The unparameterized default schema only requires >0 duration, so this
    // would pass without parameter-set-derived minimums wired in.
    const looseSchema = makeTemperatureCheckFormSchema()
    const strictSchema = makeTemperatureCheckFormSchema({
      temperatureCheckVotingUnits: 5,
      electionVotingUnits: 5
    })

    const barelyValidForDefault = {
      ...baseMajorityJudgmentForm,
      tcVotingStart: localDateTime(1 * msPerGovernanceDurationUnit),
      tcVotingEnd: localDateTime(2 * msPerGovernanceDurationUnit),
      votingStart: localDateTime(2 * msPerGovernanceDurationUnit),
      votingEnd: localDateTime(3 * msPerGovernanceDurationUnit)
    }

    assert.strictEqual(
      Schema.decodeUnknownEither(looseSchema)(barelyValidForDefault)._tag,
      'Right'
    )
    assert.strictEqual(
      Schema.decodeUnknownEither(strictSchema)(barelyValidForDefault)._tag,
      'Left'
    )
  })
})
