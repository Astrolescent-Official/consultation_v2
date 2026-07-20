import {
  ComponentAddress,
  FungibleResourceAddress,
  PackageAddress
} from '@radix-effects/shared'
import {
  Config as ConfigEffect,
  Context,
  Data,
  Effect,
  Layer,
  Option
} from 'effect'

const StokenetConfig = {
  packageAddress: PackageAddress.make(
    'package_tdx_2_1p52l57u32xpsfqv5wtvd0c727mh485qafef0dlhm0x7r67nm3t6pj8'
  ),
  componentAddress: ComponentAddress.make(
    'component_tdx_2_1cz39h4p559znxv9vxm6vyaxwyewwdyjl0qyswwssw524euat7vjyu4'
  ),
  adminBadgeAddress: FungibleResourceAddress.make(
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
  adminBadgeAddress: FungibleResourceAddress.make(
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
    readonly adminBadgeAddress: FungibleResourceAddress
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
    const componentAddress = yield* ConfigEffect.option(
      ConfigEffect.string('GOVERNANCE_COMPONENT_ADDRESS')
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

    return Layer.succeed(GovernanceConfig, {
      ...config,
      componentAddress: Option.match(componentAddress, {
        onNone: () => config.componentAddress,
        onSome: ComponentAddress.make
      })
    })
  })
)
