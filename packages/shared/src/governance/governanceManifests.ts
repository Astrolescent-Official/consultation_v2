import type {
  GovernanceParameterSetInput,
  MakeTemperatureCheckInput
} from './schemas'

export const encodeManifestString = (value: string) => JSON.stringify(value)

export const renderParameterSetIdOption = (parameterSetId?: string) =>
  parameterSetId === undefined
    ? 'Enum<0u8>()'
    : `Enum<1u8>(${encodeManifestString(parameterSetId)})`

export const renderGovernanceParameterSetInput = (
  input: GovernanceParameterSetInput
) =>
  `Tuple(${encodeManifestString(input.label)}, Tuple(${input.temperatureCheckDays}u16, Decimal(${encodeManifestString(input.temperatureCheckQuorum)}), Decimal(${encodeManifestString(input.temperatureCheckApprovalThreshold)}), ${input.proposalLengthDays}u16, Decimal(${encodeManifestString(input.proposalQuorum)}), Decimal(${encodeManifestString(input.proposalApprovalThreshold)})))`

type TemperatureCheckDraftManifestInput = Omit<
  MakeTemperatureCheckInput,
  'authorAccount' | 'parameterSetId'
>

export const renderTemperatureCheckDraft = (
  input: TemperatureCheckDraftManifestInput
) => {
  const voteOptions = input.voteOptions
    .map((option) => `Tuple(${encodeManifestString(option)})`)
    .join(', ')
  const links = input.links.map(encodeManifestString).join(', ')
  const maxSelections =
    input.maxSelections === 1
      ? 'Enum<0u8>()'
      : `Enum<1u8>(${input.maxSelections}u32)`

  return `Tuple(${encodeManifestString(input.title)}, ${encodeManifestString(input.shortDescription)}, ${encodeManifestString(input.description)}, Array<Tuple>(${voteOptions}), Array<String>(${links}), ${maxSelections})`
}
