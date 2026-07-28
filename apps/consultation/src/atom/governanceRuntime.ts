import { ConfigProvider, Layer } from 'effect'
import { GatewayApiClientLayer } from 'shared/gateway'
import {
  AdminBadgeService,
  GovernanceComponent,
  GovernanceConfigLayer
} from 'shared/governance/index'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { RadixDappToolkit, SendTransaction } from '@/lib/dappToolkit'
import { envVars } from '@/lib/envVars'

/**
 * The one governance service graph for the app. Layers memoize by reference, so
 * every atom module must share this value rather than rebuilding an equivalent
 * stack — that is what keeps a single RadixDappToolkit and Gateway client alive
 * across the whole app.
 */
export const governanceRuntime = makeAtomRuntime(
  Layer.mergeAll(
    GovernanceComponent.Default,
    AdminBadgeService.Default,
    SendTransaction.Default
  ).pipe(
    Layer.provideMerge(RadixDappToolkit.Live),
    Layer.provideMerge(GatewayApiClientLayer),
    Layer.provide(GovernanceConfigLayer),
    Layer.provide(Layer.setConfigProvider(ConfigProvider.fromJson(envVars)))
  )
)
