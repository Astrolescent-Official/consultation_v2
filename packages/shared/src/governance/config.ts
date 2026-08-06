import {
  ComponentAddress,
  FungibleResourceAddress,
  NonFungibleResourceAddress,
  PackageAddress
} from '@radix-effects/shared'
import { Config as ConfigEffect, Context, Data, Effect, Layer } from 'effect'

const StokenetConfig = {
  packageAddress: PackageAddress.make(
    'package_tdx_2_1p5h67uvtzygusykn6gwv5jlsmgz8yvu4h25j8nz22hlug5kukmkkvc'
  ),
  componentAddress: ComponentAddress.make(
    'component_tdx_2_1crwpaq0k9fxhp65t8hc4qjcu894t29k70y599ch7kunc9hhmgd0zdh'
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
    'package_rdx1p49s2442esdzs7wet7wucpagnftctml8aecc6a74q67r8r023u4dzn'
  ),
  componentAddress: ComponentAddress.make(
    'component_rdx1cpg8ehtstxnxzj5rzpefnp4vxk8c87pds29r65cgm4cs8akv5ee8tt'
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
