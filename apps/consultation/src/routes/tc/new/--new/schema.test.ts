import { Schema } from 'effect'
import { assert, describe, it } from 'vitest'
import { TemperatureCheckFormSchema } from './schema'

const validForm = {
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
})
