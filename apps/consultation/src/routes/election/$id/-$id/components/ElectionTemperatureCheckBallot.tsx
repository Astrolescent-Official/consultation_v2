import { Result, useAtomValue } from '@effect-atom/atom-react'
import type { TemperatureCheckId } from 'shared/governance/brandedTypes'
import type { KeyValueStoreAddress } from 'shared/schemas'
import {
  getTemperatureCheckByIdAtom,
  getTemperatureCheckVotesByAccountsAtom
} from '@/atom/temperatureChecksAtom'
import { VotingSection } from '@/routes/tc/$id/-$id/components/VotingSection'

// While candidate-list voting is open, the live voters KVS address is only
// available on-chain (it is not mirrored into the D1 projection), so this
// still needs its own Gateway fetch — unlike the deadline/outcome data the
// parent stage already has from the election response.
export function ElectionTemperatureCheckBallot({
  temperatureCheckId
}: {
  readonly temperatureCheckId: TemperatureCheckId
}) {
  const temperatureCheck = useAtomValue(
    getTemperatureCheckByIdAtom(temperatureCheckId)
  )

  return Result.builder(temperatureCheck)
    .onInitial(() => null)
    .onFailure(() => null)
    .onSuccess((tc) => (
      <ElectionTemperatureCheckVoting
        temperatureCheckId={temperatureCheckId}
        voters={tc.voters}
      />
    ))
    .render()
}

function ElectionTemperatureCheckVoting({
  temperatureCheckId,
  voters
}: {
  readonly temperatureCheckId: TemperatureCheckId
  readonly voters: KeyValueStoreAddress
}) {
  const accountVotes = useAtomValue(
    getTemperatureCheckVotesByAccountsAtom(voters)
  )
  return (
    <VotingSection
      temperatureCheckId={temperatureCheckId}
      keyValueStoreAddress={voters}
      accountsVotesResult={accountVotes}
    />
  )
}
