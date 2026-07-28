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
