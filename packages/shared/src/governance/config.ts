import {
  ComponentAddress,
  FungibleResourceAddress,
  NonFungibleResourceAddress,
  PackageAddress
} from '@radix-effects/shared'
import { Config as ConfigEffect, Context, Data, Effect, Layer } from 'effect'

const StokenetConfig = {
  packageAddress: PackageAddress.make(
    'package_tdx_2_1pkg4qzu3heh592waney22cyxkeued3mlwfe4xxw3hz9rwtyrhdqhft'
  ),
  componentAddress: ComponentAddress.make(
    'component_tdx_2_1cr3t55wx3dnhzgtk2hkn47mmkllr2z79lmwkvw65ltaluzylz4jpsc'
  ),
  adminBadgeAddress: NonFungibleResourceAddress.make(
    'resource_tdx_2_1nfdxglpp5h908thwss32zs2sy9gvyye7jhajm8l6fn72p9d8nhqnaq'
  ),
  xrdResourceAddress: FungibleResourceAddress.make(
    'resource_tdx_2_1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxtfd2jc'
  )
}

const MainnetConfig = {
  packageAddress: PackageAddress.make(
    'package_rdx1p5w0ckjksr2q7ww5f5u76dzmvvekmyae2t7p6k2xm9v26ysddqvsvk'
  ),
  componentAddress: ComponentAddress.make(
    'component_rdx1cz8tzcyyj9zlactrq9nqcnnagg56fn84p4e73gvlzp2s6krde89k9y'
  ),
  adminBadgeAddress: NonFungibleResourceAddress.make(
    'resource_rdx1ng4c5k872hvhr379n0z0x6ht2n0guugns4jeh6mck9y28cu432xvc4'
  ),
  xrdResourceAddress: FungibleResourceAddress.make(
    'resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd'
  )
}
export class UnsupportedNetworkIdError extends Data.TaggedError(
  '@GovernenceConfig/UnsupportedNetworkIdError'
)<{
  message: string
}> {}

export class GovernanceConfig extends Context.Tag('@Governance/Config')<
  GovernanceConfig,
  {
    readonly packageAddress: PackageAddress
    readonly componentAddress: ComponentAddress
    readonly adminBadgeAddress:
      | FungibleResourceAddress
      | NonFungibleResourceAddress
    readonly xrdResourceAddress: FungibleResourceAddress
  }
>() {
  static StokenetLive = Layer.succeed(this, StokenetConfig)

  static MainnetLive = Layer.succeed(this, MainnetConfig)
}

export const GovernanceConfigLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const networkId = yield* ConfigEffect.number('NETWORK_ID').pipe(
      Effect.orDie
    )
    const config =
      networkId === 1
        ? MainnetConfig
        : networkId === 2
          ? StokenetConfig
          : undefined

    if (config === undefined) {
      return yield* new UnsupportedNetworkIdError({
        message: `Unsupported network ID: ${networkId}`
      })
    }

    return Layer.succeed(GovernanceConfig, config)
  })
)
