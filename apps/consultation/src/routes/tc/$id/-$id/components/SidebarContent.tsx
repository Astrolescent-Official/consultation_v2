import type { Result } from '@effect-atom/atom-react'
import type { TemperatureCheckId } from 'shared/governance/brandedTypes'
import type { TemperatureCheckSchema } from 'shared/governance/schemas'
import { AccountVotesSection } from '@/components/detail/AccountVotesSection'
import { VoteResultsSection } from '@/components/detail/VoteResultsSection'
import {
  getTemperatureCheckBallotWording,
  getTemperatureCheckVoteOptions
} from '@/lib/tcBallotWording'
import type { VotedAccount } from '../types'
import { TemperatureCheckResultStatus } from './TemperatureCheckResultStatus'
import { VotingSection } from './VotingSection'

type TemperatureCheck = typeof TemperatureCheckSchema.Type

type SidebarContentProps = {
  temperatureCheck: TemperatureCheck
  id: TemperatureCheckId
  accountsVotesResult: Result.Result<VotedAccount[], unknown>
}

export function SidebarContent({
  temperatureCheck,
  id,
  accountsVotesResult
}: SidebarContentProps) {
  const wording = getTemperatureCheckBallotWording(temperatureCheck.followUp)
  const voteOptions = getTemperatureCheckVoteOptions(wording)

  return (
    <div className="space-y-6">
      <VoteResultsSection
        entityType="temperature_check"
        entityId={id}
        voteOptions={voteOptions}
        renderStatus={
          wording === 'legacy'
            ? undefined
            : (results) => (
                <TemperatureCheckResultStatus
                  tc={temperatureCheck}
                  results={results}
                />
              )
        }
      />

      <VotingSection
        temperatureCheckId={id}
        keyValueStoreAddress={temperatureCheck.voters}
        accountsVotesResult={accountsVotesResult}
        wording={wording}
      />

      <AccountVotesSection
        entityType="temperature_check"
        entityId={id}
        voteOptions={voteOptions}
      />
    </div>
  )
}
