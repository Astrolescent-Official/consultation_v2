import { Result, useAtomValue } from '@effect-atom/atom-react'
import type { ReactNode } from 'react'
import { currentVotingPowerAtom } from '@/atom/currentVotingPowerAtom'
import { useCurrentAccount } from '@/hooks/useCurrentAccount'
import {
  CAVIARNINE_SHAPE_POOLS_EPOCH_0,
  OCISWAP_PRECISION_POOLS_V1_EPOCH_0,
  OCISWAP_PRECISION_POOLS_V2_EPOCH_0,
  POOL_UNIT_POOLS_EPOCH_0
} from '@/server/voting/vote-calculation/dex/constants/addresses'
import {
  LSULP_RESOURCE_ADDRESS,
  XRD_ADDRESS
} from '@/server/voting/vote-calculation/dex/constants/assets'

type EligibleDexPosition = {
  readonly dex: string
  readonly pair: string
  readonly positionType: string
  readonly resourceAddress: string
  readonly poolAddress: string
}

const precisionPositions: readonly EligibleDexPosition[] = [
  ...OCISWAP_PRECISION_POOLS_V1_EPOCH_0.map((pool) => ({
    dex: 'Ociswap V1',
    pair: pool.name,
    positionType: 'Precision liquidity receipt',
    resourceAddress: pool.lpResourceAddress,
    poolAddress: pool.componentAddress
  })),
  ...OCISWAP_PRECISION_POOLS_V2_EPOCH_0.map((pool) => ({
    dex: 'Ociswap V2',
    pair: pool.name,
    positionType: 'Precision liquidity receipt',
    resourceAddress: pool.lpResourceAddress,
    poolAddress: pool.componentAddress
  }))
]

const poolUnitPositions: readonly EligibleDexPosition[] =
  POOL_UNIT_POOLS_EPOCH_0.map((pool) => {
    const [dex, ...pairParts] = pool.name.split(': ')

    return {
      dex,
      pair: pairParts.join(': '),
      positionType: 'Pool unit token',
      resourceAddress: pool.lpResourceAddress,
      poolAddress: pool.poolAddress
    }
  })

const shapePositions: readonly EligibleDexPosition[] =
  CAVIARNINE_SHAPE_POOLS_EPOCH_0.map((pool) => ({
    dex: 'CaviarNine Shape',
    pair: pool.name,
    positionType: 'Liquidity receipt NFT',
    resourceAddress: pool.liquidity_receipt,
    poolAddress: pool.componentAddress
  }))

const eligibleDexPositions = [
  ...precisionPositions,
  ...poolUnitPositions,
  ...shapePositions
]

export const EligibleVotingTokens = () => (
  <div className="space-y-12">
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold text-neutral-900 dark:text-white">
        Eligible voting tokens
      </h1>
      <p className="max-w-3xl text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
        Voting power includes the XRD represented by the assets and liquidity
        positions below. This is the current static allowlist used when a vote
        is snapshotted.
      </p>
    </div>

    <ConnectedVotingPower />

    <section className="space-y-4" aria-labelledby="direct-holdings-heading">
      <h2
        id="direct-holdings-heading"
        className="border-b border-neutral-200 pb-4 text-2xl font-medium text-neutral-900 dark:border-neutral-800 dark:text-white"
      >
        Direct holdings
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        <DirectHolding
          name="XRD"
          detail="1 XRD equals 1 vote."
          address={XRD_ADDRESS}
        />
        <DirectHolding
          name="Validator LSU tokens"
          detail="LSUs from every active Radix validator count for their underlying XRD value."
        />
        <DirectHolding
          name="LSULP"
          detail="LSULP counts for its underlying liquid-staked XRD value."
          address={LSULP_RESOURCE_ADDRESS}
        />
      </div>
    </section>

    <section className="space-y-4" aria-labelledby="dex-positions-heading">
      <div>
        <h2
          id="dex-positions-heading"
          className="border-b border-neutral-200 pb-4 text-2xl font-medium text-neutral-900 dark:border-neutral-800 dark:text-white"
        >
          Eligible DEX liquidity positions ({eligibleDexPositions.length})
        </h2>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          These pool units and liquidity receipts contribute the XRD, LSU, or
          LSULP contained in the position. Other tokens in the pair do not add
          voting power.
        </p>
      </div>

      <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            <tr>
              <th className="px-4 py-3 font-semibold">DEX</th>
              <th className="px-4 py-3 font-semibold">Pair</th>
              <th className="px-4 py-3 font-semibold">Position</th>
              <th className="px-4 py-3 font-semibold">Eligible resource</th>
              <th className="px-4 py-3 font-semibold">Pool</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {eligibleDexPositions.map((position) => (
              <tr key={position.resourceAddress}>
                <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                  {position.dex}
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                  {position.pair}
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                  {position.positionType}
                </td>
                <td className="break-all px-4 py-3 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                  {position.resourceAddress}
                </td>
                <td className="break-all px-4 py-3 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                  {position.poolAddress}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </div>
)

const ConnectedVotingPower = () => {
  const account = useCurrentAccount()

  if (!account) return null

  return <ConnectedVotingPowerValue accountAddress={account.address} />
}

const ConnectedVotingPowerValue = ({
  accountAddress
}: {
  accountAddress: string
}) => {
  const votingPower = useAtomValue(currentVotingPowerAtom(accountAddress))

  return Result.builder(votingPower)
    .onInitial(() => (
      <WalletVotingPowerCard>
        Calculating eligible voting power…
      </WalletVotingPowerCard>
    ))
    .onFailure(() => (
      <WalletVotingPowerCard>
        Unable to calculate eligible voting power for the connected wallet.
      </WalletVotingPowerCard>
    ))
    .onSuccess(({ votePower }) => (
      <WalletVotingPowerCard>
        Your connected wallet currently has{' '}
        <strong className="text-neutral-900 dark:text-white">
          {votePower} XRD
        </strong>{' '}
        of eligible voting power, rounded down to whole XRD.
      </WalletVotingPowerCard>
    ))
    .render()
}

const WalletVotingPowerCard = ({ children }: { children: ReactNode }) => (
  <div className="border border-neutral-200 bg-neutral-100 p-5 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
    {children}
  </div>
)

const DirectHolding = ({
  name,
  detail,
  address
}: {
  name: string
  detail: string
  address?: string
}) => (
  <article className="space-y-2 border border-neutral-200 p-4 dark:border-neutral-800">
    <h3 className="font-semibold text-neutral-900 dark:text-white">{name}</h3>
    <p className="text-sm text-neutral-600 dark:text-neutral-400">{detail}</p>
    {address ? (
      <p className="break-all font-mono text-xs text-neutral-500">{address}</p>
    ) : null}
  </article>
)
