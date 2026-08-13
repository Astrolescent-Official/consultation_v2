import * as EffectBoolean from 'effect/Boolean'
import { constant, pipe } from 'effect/Function'
import { type AppConfig, decodeAppConfig } from './appConfig'

const isVitest = typeof import.meta.env.VITEST !== 'undefined'

const vitestMockEnvVars: typeof AppConfig.Encoded = {
  ENV: 'local',
  DAPP_DEFINITION_ADDRESS:
    'account_rdx129xqyvgkn9h73atyrzndal004fwye3tzw49kkygv9ltm2kyrv2lmda',
  NETWORK_ID: '1'
}

const runtimeEnvVars = () =>
  import.meta.env.SSR
    ? {
        ENV: process.env.ENV,
        DAPP_DEFINITION_ADDRESS: process.env.DAPP_DEFINITION_ADDRESS,
        NETWORK_ID: process.env.NETWORK_ID
      }
    : window.__APP_CONFIG__

export const envVars = pipe(
  EffectBoolean.match(isVitest, {
    onTrue: constant(vitestMockEnvVars),
    onFalse: runtimeEnvVars
  }),
  decodeAppConfig,
  (envVars) => ({
    ...envVars,
    EFFECTIVE_ENV: envVars.ENV === 'local' ? 'dev' : envVars.ENV
  })
)
