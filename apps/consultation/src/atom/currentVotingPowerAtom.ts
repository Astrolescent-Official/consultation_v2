import { Atom } from '@effect-atom/atom-react'
import { Effect } from 'effect'
import { VoteClient, voteClientRuntime } from '@/atom/voteClient'

export const currentVotingPowerAtom = Atom.family((accountAddress: string) =>
  voteClientRuntime.atom(
    Effect.gen(function* () {
      const client = yield* VoteClient
      return yield* client.GetCurrentVotingPower({ accountAddress })
    })
  )
)
