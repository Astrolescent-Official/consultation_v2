import { Effect, Layer } from 'effect'
import { expect, it, vi } from 'vitest'
import { getCurrentVotingPower } from './currentVotingPowerAtom'
import { VoteClient } from './voteClient'

it('loads the connected account voting-power response through VoteClient', async () => {
  const response = {
    votePower: '42',
    resourceBalances: { resource_xrd: '40' },
    validatorLsuBalances: [{ resourceAddress: 'resource_lsu', amount: '2' }],
    xrdResourceAddress: 'resource_xrd'
  }
  const getCurrent = vi.fn(() => Effect.succeed(response))
  const client = {
    GetCurrentVotingPower: getCurrent
  }

  await expect(
    Effect.runPromise(
      getCurrentVotingPower('account_test').pipe(
        Effect.provide(Layer.succeed(VoteClient, client as never))
      )
    )
  ).resolves.toEqual(response)
  expect(getCurrent).toHaveBeenCalledWith({ accountAddress: 'account_test' })
})
