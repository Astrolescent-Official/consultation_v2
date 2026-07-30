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

const formatLocalDateTime = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)

export const makeMajorityJudgmentSchedule = (
  minimums: {
    readonly temperatureCheckVotingUnits: number
    readonly electionVotingUnits: number
  },
  now = new Date()
) => {
  // Leave one full unit before the TC starts. A datetime-local input omits
  // seconds, so this avoids a schedule becoming invalid while the user fills
  // in the form.
  const tcStart = new Date(now.getTime() + 2 * msPerGovernanceDurationUnit)
  const tcEnd = new Date(
    tcStart.getTime() +
      minimums.temperatureCheckVotingUnits * msPerGovernanceDurationUnit
  )
  const votingStart = new Date(tcEnd)
  const votingEnd = new Date(
    votingStart.getTime() +
      minimums.electionVotingUnits * msPerGovernanceDurationUnit
  )

  return {
    tcVotingStart: formatLocalDateTime(tcStart),
    tcVotingEnd: formatLocalDateTime(tcEnd),
    votingStart: formatLocalDateTime(votingStart),
    votingEnd: formatLocalDateTime(votingEnd)
  }
}

const defaultMajorityJudgmentSchedule = makeMajorityJudgmentSchedule({
  temperatureCheckVotingUnits: 1,
  electionVotingUnits: 1
})

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
    candidates: [createCandidate(), createCandidate()],
    ...defaultMajorityJudgmentSchedule
  }
})
