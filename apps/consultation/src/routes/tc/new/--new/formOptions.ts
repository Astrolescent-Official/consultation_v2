import { formOptions } from '@tanstack/react-form'
import { DEFAULT_PARAMETER_SET_ID } from 'shared/governance/schemas'
import { msPerGovernanceDurationUnit } from '@/lib/governanceDuration'

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

export const createCandidate = (): CandidateFormValue => ({
  id: crypto.randomUUID(),
  reference: '',
  displayName: '',
  description: '',
  links: []
})

const defaultProcessType = (): 'Standard' | 'MajorityJudgment' => 'Standard'

const localDateTime = (offsetMs: number) => {
  const date = new Date(Date.now() + offsetMs)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

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
    roleId: '',
    seatCount: 1,
    candidates: [createCandidate(), createCandidate()],
    // Scaled in governance-duration units (minutes on stokenet, days
    // elsewhere) so the seeded schedule stays realistic relative to the
    // network's actual minimums instead of always assuming day-scale voting.
    tcVotingStart: localDateTime(1 * msPerGovernanceDurationUnit),
    tcVotingEnd: localDateTime(2 * msPerGovernanceDurationUnit),
    votingStart: localDateTime(3 * msPerGovernanceDurationUnit),
    votingEnd: localDateTime(7 * msPerGovernanceDurationUnit)
  }
})
