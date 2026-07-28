import { Schema } from 'effect'
import { assert, describe, it } from 'vitest'
import { temperatureCheckFormOpts } from './formOptions'
import { TemperatureCheckFormSchema } from './schema'

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
  parameterSetId: 'default'
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
      'Left'
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
