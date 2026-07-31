import {
  ComponentAddress,
  FungibleResourceAddress,
  PackageAddress
} from '@radix-effects/shared'
import { Context, Effect, Layer, Config as ConfigEffect, Data } from 'effect'

<<<<<<< Updated upstream
=======
const StokenetConfig = {
   packageAddress: PackageAddress.make(
    'package_tdx_2_1pkkqvahjxykk7en5r0d0gsq06kzw2gd0mgxl4hjdjdfyxgdlqaehtk'
  ),
  componentAddress: ComponentAddress.make(
    'component_tdx_2_1cq627a0qv4xmjrzl7yym0ryl720vmp803u0nm40w49y5m30k5dgcej'
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
>>>>>>> Stashed changes
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
  static StokenetLive = Layer.succeed(this, {
    packageAddress: PackageAddress.make(
      'package_tdx_2_1p5cv7gym87c8dnsdx8rlv587mqw34v6qmska5ctxh04st0t07wq32s'
    ),
    componentAddress: ComponentAddress.make(
      'component_tdx_2_1cqnp3rptnwqjc4r7kzwkctec09jkdqa8v2rue580kw66fvt4ctpnmc'
    ),
    adminBadgeAddress: FungibleResourceAddress.make(
      'resource_tdx_2_1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxtfd2jc'
    ),
    xrdResourceAddress: FungibleResourceAddress.make(
      'resource_tdx_2_1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxtfd2jc'
    )
  })

  static MainnetLive = Layer.succeed(this, {
    packageAddress: PackageAddress.make('TODO_MAINNET_PACKAGE_ADDRESS'),
    componentAddress: ComponentAddress.make('TODO_MAINNET_COMPONENT_ADDRESS'),
    adminBadgeAddress: FungibleResourceAddress.make(
      'TODO_MAINNET_ADMIN_BADGE_ADDRESS'
    ),
    xrdResourceAddress: FungibleResourceAddress.make(
      'resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd'
    )
  })
}

export const GovernanceConfigLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const networkId = yield* ConfigEffect.number('NETWORK_ID').pipe(
      Effect.orDie
    )

    if (networkId === 1) {
      return GovernanceConfig.MainnetLive
    } else if (networkId === 2) {
      return GovernanceConfig.StokenetLive
    } else {
      return yield* new UnsupportedNetworkIdError({
        message: `Unsupported network ID: ${networkId}`
      })
    }
  })
)
