import type { Grade, MajorityJudgmentCandidateInput } from './majorityJudgment'
import type {
  GovernanceParameterSetInput,
  MakeTemperatureCheckInput
} from './schemas'

export const encodeManifestString = (value: string) => JSON.stringify(value)

const gradeDiscriminant = (grade: Grade) => grade

export const renderInstant = (instant: Date) =>
  `${Math.floor(instant.getTime() / 1000)}i64`

export const renderCandidateOrder = (candidateIds: ReadonlyArray<number>) =>
  `Array<Tuple>(${candidateIds
    .map((candidateId) => `Tuple(${candidateId}u32)`)
    .join(', ')})`

export const renderCandidateGrades = (
  grades: ReadonlyArray<{
    readonly candidateId: number
    readonly grade: Grade
  }>
) =>
  `Array<Tuple>(${[...grades]
    .sort((left, right) => left.candidateId - right.candidateId)
    .map(
      ({ candidateId, grade }) =>
        `Tuple(Tuple(${candidateId}u32), Enum<${gradeDiscriminant(grade)}u8>())`
    )
    .join(', ')})`

export const renderMajorityJudgmentCandidateInputs = (
  candidates: ReadonlyArray<MajorityJudgmentCandidateInput>
) =>
  `Array<Tuple>(${candidates
    .map(
      (candidate) =>
        `Tuple(${encodeManifestString(candidate.reference)}, ${encodeManifestString(candidate.displayName)}, ${encodeManifestString(candidate.description)}, Array<String>(${candidate.links.map(encodeManifestString).join(', ')}))`
    )
    .join(', ')})`

export const renderParameterSetIdOption = (parameterSetId?: string) =>
  parameterSetId === undefined
    ? 'Enum<0u8>()'
    : `Enum<1u8>(${encodeManifestString(parameterSetId)})`

export const renderGovernanceParameterSetInput = (
  input: GovernanceParameterSetInput
) => {
  const temperatureCheck = `Tuple(${input.temperatureCheck.votingDays}u32, Decimal(${encodeManifestString(input.temperatureCheck.quorum)}), Decimal(${encodeManifestString(input.temperatureCheck.approvalThreshold)}))`
  const process =
    input._tag === 'Standard'
      ? `Enum<0u8>(${temperatureCheck}, Tuple(${input.proposal.votingDays}u32, Decimal(${encodeManifestString(input.proposal.quorum)}), Decimal(${encodeManifestString(input.proposal.approvalThreshold)})))`
      : `Enum<1u8>(${temperatureCheck}, Tuple(${input.election.reviewDays}u32, ${input.election.votingDays}u32, Decimal(${encodeManifestString(input.election.quorum)}), Enum<${gradeDiscriminant(input.election.minimumMedianGrade)}u8>(), ${input.election.rerunVotingDays}u32, Decimal(${encodeManifestString(input.election.rerunQuorum)}), Enum<${gradeDiscriminant(input.election.rerunMinimumMedianGrade)}u8>(), ${input.election.reserveListDays}u32))`

  return `Tuple(${encodeManifestString(input.label)}, ${process})`
}

type TemperatureCheckDraftManifestInput = Omit<
  MakeTemperatureCheckInput,
  'authorAccount' | 'parameterSetId'
>

export const renderTemperatureCheckDraft = (
  input: TemperatureCheckDraftManifestInput
) => {
  const links = input.links.map(encodeManifestString).join(', ')
  const followUp =
    input.followUp._tag === 'StandardProposal'
      ? `Enum<0u8>(Array<Tuple>(${input.followUp.voteOptions
          .map((option) => `Tuple(${encodeManifestString(option)})`)
          .join(', ')}), ${
          input.followUp.maxSelections === 1
            ? 'Enum<0u8>()'
            : `Enum<1u8>(${input.followUp.maxSelections}u32)`
        })`
      : `Enum<1u8>(${encodeManifestString(input.followUp.roleId)}, ${input.followUp.seatCount}u32, ${renderMajorityJudgmentCandidateInputs(input.followUp.candidates)})`

  return `Tuple(${encodeManifestString(input.title)}, ${encodeManifestString(input.shortDescription)}, ${encodeManifestString(input.description)}, Array<String>(${links}), ${followUp})`
}
