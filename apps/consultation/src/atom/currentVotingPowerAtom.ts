import { Atom } from '@effect-atom/atom-react'
import { Effect } from 'effect'
import { VoteClient, voteClientRuntime } from '@/atom/voteClient'

export const getCurrentVotingPower = (accountAddress: string) =>
  Effect.gen(function* () {
    const client = yield* VoteClient
    return yield* client.GetCurrentVotingPower({ accountAddress })
  })

export const currentVotingPowerAtom = Atom.family((accountAddress: string) =>
  voteClientRuntime.atom(getCurrentVotingPower(accountAddress))
)
