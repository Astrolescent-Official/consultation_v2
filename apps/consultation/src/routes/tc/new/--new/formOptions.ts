import { formOptions } from '@tanstack/react-form'
import { DEFAULT_PARAMETER_SET_ID } from 'shared/governance/schemas'

export type VoteOption = { id: string; label: string }
export type CandidateFormValue = {
  id: string
  reference: string
  displayName: string
  description: string
  links: string[]
}

export const createVoteOption = (label = ''): VoteOption => ({
  id: crypto.randomUUID(),
  label
})

export const DEFAULT_VOTE_OPTIONS: VoteOption[] = [
  createVoteOption(),
  createVoteOption()
]

export const ABSTAIN_VOTE_OPTION_LABEL = 'Abstain'

export const getProposalVoteOptionLabels = ({
  voteOptions,
  maxSelections,
  includeAbstain,
  isAdmin
}: {
  voteOptions: ReadonlyArray<VoteOption>
  maxSelections: number
  includeAbstain: boolean
  isAdmin: boolean
}): string[] => {
  const labels = voteOptions.map(({ label }) => label)
  const shouldIncludeAbstain =
    maxSelections === 1 && (includeAbstain || !isAdmin)

  return shouldIncludeAbstain ? [...labels, ABSTAIN_VOTE_OPTION_LABEL] : labels
}

export const createCandidate = (): CandidateFormValue => ({
  id: crypto.randomUUID(),
  reference: '',
  displayName: '',
  description: '',
  links: []
})

const defaultProcessType = (): 'Standard' | 'MajorityJudgment' => 'Standard'

export const temperatureCheckFormOpts = formOptions({
  defaultValues: {
    processType: defaultProcessType(),
    parameterSetId: DEFAULT_PARAMETER_SET_ID,
    title: '',
    shortDescription: '',
    description: '',
    radixTalkUrl: '',
    links: [''] as string[],
    voteOptions: DEFAULT_VOTE_OPTIONS,
    maxSelections: 1,
    includeAbstain: true,
    roleId: '',
    seatCount: 1,
    candidates: [createCandidate(), createCandidate()]
  }
})
