import { AccountAddress, ComponentAddress } from '@radix-effects/shared'
import * as Schema from 'effect/Schema'

export class AppConfig extends Schema.Class<AppConfig>('AppConfig')({
  ENV: Schema.Literal('local', 'preview', 'production'),
  DAPP_DEFINITION_ADDRESS: AccountAddress,
  GOVERNANCE_COMPONENT_ADDRESS: ComponentAddress,
  NETWORK_ID: Schema.NumberFromString
}) {}

declare global {
  interface Window {
    __APP_CONFIG__: typeof AppConfig.Encoded
  }
}

export const decodeAppConfig = Schema.decodeUnknownSync(AppConfig)

type WorkerAppConfigEnv = Pick<
  Env,
  | 'ENV'
  | 'DAPP_DEFINITION_ADDRESS'
  | 'GOVERNANCE_COMPONENT_ADDRESS'
  | 'NETWORK_ID'
>

const encodedWorkerAppConfig = (env: WorkerAppConfigEnv) => ({
  ENV: env.ENV,
  DAPP_DEFINITION_ADDRESS: env.DAPP_DEFINITION_ADDRESS,
  GOVERNANCE_COMPONENT_ADDRESS: env.GOVERNANCE_COMPONENT_ADDRESS,
  NETWORK_ID: env.NETWORK_ID
})

export const makeAppConfigScript = (env: WorkerAppConfigEnv) => {
  const config = encodedWorkerAppConfig(env)
  decodeAppConfig(config)
  const serialized = JSON.stringify(config).replaceAll('<', '\\u003c')
  return `globalThis.__APP_CONFIG__=${serialized};`
}
