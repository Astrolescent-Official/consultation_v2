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
].sort(
  (left, right) =>
    left.dex.localeCompare(right.dex) || left.pair.localeCompare(right.pair)
)

export const EligibleVotingTokens = () => {
  const account = useCurrentAccount()

  if (!account) return <EligibleVotingTokensContent />

  return <ConnectedEligibleVotingTokens accountAddress={account.address} />
}

const ConnectedEligibleVotingTokens = ({
  accountAddress
}: {
  accountAddress: string
}) => {
  const votingPower = useAtomValue(currentVotingPowerAtom(accountAddress))

  return Result.builder(votingPower)
    .onInitial(() => <EligibleVotingTokensContent />)
    .onFailure(() => <EligibleVotingTokensContent />)
    .onSuccess(
      ({
        votePower,
        resourceBalances,
        validatorLsuBalances,
        xrdResourceAddress
      }) => (
        <EligibleVotingTokensContent
          votePower={votePower}
          resourceBalances={resourceBalances}
          validatorLsuBalances={validatorLsuBalances}
          xrdResourceAddress={xrdResourceAddress}
        />
      )
    )
    .render()
}

const EligibleVotingTokensContent = ({
  votePower,
  resourceBalances,
  validatorLsuBalances,
  xrdResourceAddress = XRD_ADDRESS
}: {
  votePower?: string
  resourceBalances?: Readonly<Record<string, string>>
  validatorLsuBalances?: ReadonlyArray<{
    resourceAddress: string
    amount: string
  }>
  xrdResourceAddress?: string
}) => (
  <div className="space-y-12">
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold text-foreground">
        Eligible voting tokens
      </h1>
      <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">
        Voting power includes the XRD represented by the assets and liquidity
        positions below. This is the current static allowlist used when a vote
        is snapshotted.
      </p>
    </div>

    {votePower ? (
      <WalletVotingPowerCard>
        Your connected wallet currently has{' '}
        <strong className="text-foreground">{votePower} XRD</strong> of eligible
        voting power.
      </WalletVotingPowerCard>
    ) : null}

    <section className="space-y-4" aria-labelledby="direct-holdings-heading">
      <h2
        id="direct-holdings-heading"
        className="border-b border-border pb-4 text-2xl font-medium text-foreground dark:border-border dark:text-white"
      >
        Direct holdings
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        <DirectHolding
          name="XRD"
          detail="1 XRD equals 1 vote."
          address={xrdResourceAddress}
          walletAmount={
            resourceBalances
              ? (resourceBalances[xrdResourceAddress] ?? '0')
              : undefined
          }
        />
        <DirectHolding
          name="Validator LSU tokens"
          detail="LSUs from every active Radix validator count for their underlying XRD value."
          walletLsuBalances={validatorLsuBalances}
        />
        <DirectHolding
          name="LSULP"
          detail="LSULP counts for its underlying liquid-staked XRD value."
          address={LSULP_RESOURCE_ADDRESS}
          walletAmount={
            resourceBalances
              ? (resourceBalances[LSULP_RESOURCE_ADDRESS] ?? '0')
              : undefined
          }
        />
      </div>
    </section>

    <section className="space-y-4" aria-labelledby="dex-positions-heading">
      <div>
        <h2
          id="dex-positions-heading"
          className="border-b border-border pb-4 text-2xl font-medium text-foreground dark:border-border dark:text-white"
        >
          Eligible DEX liquidity positions ({eligibleDexPositions.length})
        </h2>
        <p className="mt-3 text-muted-foreground">
          These pool units and liquidity receipts contribute the XRD, LSU, or
          LSULP contained in the position. Other tokens in the pair do not add
          voting power.
        </p>
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-muted text-foreground dark:bg-muted dark:text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">DEX</th>
              <th className="px-4 py-3 font-semibold">Pair</th>
              <th className="px-4 py-3 font-semibold">Eligible resource</th>
              <th className="px-4 py-3 font-semibold">In your wallet</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {eligibleDexPositions.map((position) => (
              <tr key={position.resourceAddress}>
                <td className="px-4 py-3 font-medium text-foreground">
                  {position.dex}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {position.pair}
                </td>
                <td className="break-all px-4 py-3 font-mono text-xs text-muted-foreground">
                  {position.resourceAddress}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {resourceBalances?.[position.resourceAddress] ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </div>
)

const WalletVotingPowerCard = ({ children }: { children: ReactNode }) => (
  <div className="border border-border bg-muted p-5 text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground">
    {children}
  </div>
)

const DirectHolding = ({
  name,
  detail,
  address,
  walletAmount,
  walletLsuBalances
}: {
  name: string
  detail: string
  address?: string
  walletAmount?: string
  walletLsuBalances?: ReadonlyArray<{ resourceAddress: string; amount: string }>
}) => (
  <article className="space-y-2 border border-border p-4 dark:border-border">
    <h3 className="font-semibold text-foreground">{name}</h3>
    <p className="text-sm text-muted-foreground">{detail}</p>
    {address ? (
      <p className="break-all font-mono text-xs text-muted-foreground">
        {address}
      </p>
    ) : null}
    {walletAmount !== undefined ? (
      <p className="text-sm text-muted-foreground">
        In your wallet: {walletAmount}
      </p>
    ) : null}
    {walletLsuBalances ? (
      walletLsuBalances.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {walletLsuBalances.map(({ resourceAddress, amount }) => (
            <li key={resourceAddress} className="break-all">
              {amount} · {resourceAddress}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">In your wallet: 0</p>
      )
    ) : null}
  </article>
)
