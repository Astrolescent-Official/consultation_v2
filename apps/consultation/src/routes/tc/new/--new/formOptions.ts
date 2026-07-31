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

const MINIMUM_SCHEDULE_LEAD_MS = 60 * 60 * 1000

const roundUpToMinute = (timestamp: number) =>
  new Date(Math.ceil(timestamp / 60_000) * 60_000)

export const makeMajorityJudgmentSchedule = (
  minimums: {
    readonly temperatureCheckVotingUnits: number
    readonly electionVotingUnits: number
  },
  now = new Date()
) => {
  // Stokenet uses minute-scale governance units, so a two-unit lead expires
  // while a normal election form is being completed. Keep the two-unit lead
  // for day-scale networks, but always leave at least an hour. Rounding up
  // prevents the datetime-local input from truncating the start into the past.
  const tcStart = roundUpToMinute(
    now.getTime() +
      Math.max(2 * msPerGovernanceDurationUnit, MINIMUM_SCHEDULE_LEAD_MS)
  )
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
