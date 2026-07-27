import { formOptions } from '@tanstack/react-form'
import { DEFAULT_PARAMETER_SET_ID } from 'shared/governance/schemas'

export type VoteOption = { id: string; label: string }

export const createVoteOption = (label = ''): VoteOption => ({
  id: crypto.randomUUID(),
  label
})

export const DEFAULT_VOTE_OPTIONS: VoteOption[] = [
  createVoteOption(),
  createVoteOption()
]

export const temperatureCheckFormOpts = formOptions({
  defaultValues: {
    parameterSetId: DEFAULT_PARAMETER_SET_ID,
    title: '',
    shortDescription: '',
    description: '',
    radixTalkUrl: '',
    links: [''] as string[],
    voteOptions: DEFAULT_VOTE_OPTIONS,
    maxSelections: 1
  }
})
