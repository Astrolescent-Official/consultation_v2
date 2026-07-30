import { envVars } from './envVars'

export type GovernanceDurationUnit = 'minute' | 'day'

export const governanceDurationUnitForNetworkId = (
  networkId: number
): GovernanceDurationUnit => (networkId === 2 ? 'minute' : 'day')

export const governanceDurationUnit = governanceDurationUnitForNetworkId(
  envVars.NETWORK_ID
)

export const governanceDurationUnitPlural = `${governanceDurationUnit}s`

export const formatGovernanceDuration = (duration: number): string =>
  `${duration} ${governanceDurationUnit}${duration === 1 ? '' : 's'}`

/** Milliseconds represented by one governance-duration unit on this network. */
export const msPerGovernanceDurationUnit =
  governanceDurationUnit === 'minute' ? 60 * 1000 : 24 * 60 * 60 * 1000
