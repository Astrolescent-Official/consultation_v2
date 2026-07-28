import { Result, useAtomValue } from '@effect-atom/atom-react'
import { Cause } from 'effect'
import type { TemperatureCheckId } from 'shared/governance/brandedTypes'
import type { TemperatureCheckSchema } from 'shared/governance/schemas'
import {
  getTemperatureCheckByIdAtom,
  getTemperatureCheckVotesByAccountsAtom
} from '@/atom/temperatureChecksAtom'
import { AccountVotesSection } from '@/components/detail/AccountVotesSection'
import { DetailPageDetails } from '@/components/detail/DetailPageDetails'
import { DetailPageHeader } from '@/components/detail/DetailPageHeader'
import { DetailPageLayout } from '@/components/detail/DetailPageLayout'
import { HideToggle } from '@/components/detail/HideToggle'
import { ParameterSetSnapshotDetails } from '@/components/detail/ParameterSetSnapshotDetails'
import { QuorumBadge } from '@/components/detail/QuorumBadge'
import { VoteResultsSection } from '@/components/detail/VoteResultsSection'
import { InlineCode } from '@/components/ui/typography'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { TC_VOTE_OPTIONS } from '@/lib/voting'
import { getItemStatus } from '@/routes/-index/components/StatusBadge'
import { PromoteToProposal } from './components/PromoteToProposal'
import { SidebarContent } from './components/SidebarContent'
import { VotingSection } from './components/VotingSection'

type TemperatureCheck = typeof TemperatureCheckSchema.Type

// An election TC commits the role, seats and complete candidate set, so the
// community needs to see them before voting on the TC itself.
function CommittedCandidates({
  followUp
}: {
  followUp: Extract<
    TemperatureCheck['followUp'],
    { readonly _tag: 'MajorityJudgmentElection' }
  >
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-medium">Candidates</h2>
        <p className="text-sm text-muted-foreground">
          Role {followUp.roleId} · {followUp.seatCount}{' '}
          {followUp.seatCount === 1 ? 'seat' : 'seats'}. This candidate set is
          committed by the Temperature Check and cannot be replaced when the
          election is created.
        </p>
      </div>
      <ol className="space-y-3">
        {followUp.candidates.map((candidate) => (
          <li key={candidate.id} className="rounded-md border p-4">
            <p className="font-medium">{candidate.displayName}</p>
            <p className="text-xs text-muted-foreground">
              {candidate.reference}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {candidate.description}
            </p>
            {candidate.links.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-3 text-sm">
                {candidate.links.map((link) => (
                  <li key={link}>
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4"
                    >
                      Candidate profile
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function Page({ id }: { id: TemperatureCheckId }) {
  const temperatureCheck = useAtomValue(getTemperatureCheckByIdAtom(id))

  return Result.builder(temperatureCheck)
    .onInitial(() => {
      return <div>Loading...</div>
    })
    .onSuccess((tc) => <PageContent tc={tc} id={id} />)
    .onFailure((error) => {
      return <InlineCode>{Cause.pretty(error)}</InlineCode>
    })
    .render()
}

function PageContent({
  tc,
  id
}: {
  tc: TemperatureCheck
  id: TemperatureCheckId
}) {
  const isAdmin = useIsAdmin()

  if (tc.hidden && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
        <p className="text-lg font-medium">
          This temperature check has been hidden.
        </p>
      </div>
    )
  }

  return <PageContentInner tc={tc} id={id} isAdmin={isAdmin} />
}

function PageContentInner({
  tc,
  id,
  isAdmin
}: {
  tc: TemperatureCheck
  id: TemperatureCheckId
  isAdmin: boolean
}) {
  const status = getItemStatus(tc.deadline)
  const accountsVotesResult = useAtomValue(
    getTemperatureCheckVotesByAccountsAtom(tc.voters)
  )

  const header = (
    <DetailPageHeader
      status={status}
      typeBadge="TC"
      id={tc.id}
      title={tc.title}
      start={tc.start}
      deadline={tc.deadline}
      author={tc.author}
      links={tc.links.map((l) => l.toString())}
      quorumBadge={
        <QuorumBadge
          entityType="temperature_check"
          entityId={id}
          quorum={Number(tc.parameterSet.parameters.temperatureCheck.quorum)}
        />
      }
      originBadge={
        <div className="flex items-center gap-2">
          <PromoteToProposal
            temperatureCheckId={id}
            followUp={tc.followUp}
            continuation={tc.continuation}
            deadline={tc.deadline}
          />
          <HideToggle type="temperature_check" id={id} hidden={tc.hidden} />
        </div>
      }
    />
  )

  const details = (
    <>
      {tc.hidden && isAdmin && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
          This temperature check is hidden from public view.
        </div>
      )}
      <ParameterSetSnapshotDetails parameterSet={tc.parameterSet} />
      <DetailPageDetails
        shortDescription={tc.shortDescription}
        description={tc.description}
        filename={`tc-${tc.id}-details.md`}
        proposalVoteOptions={
          tc.followUp._tag === 'StandardProposal'
            ? tc.followUp.voteOptions
            : undefined
        }
      />
      {tc.followUp._tag === 'MajorityJudgmentElection' ? (
        <CommittedCandidates followUp={tc.followUp} />
      ) : null}
    </>
  )

  const resultsContent = (
    <>
      <VoteResultsSection
        entityType="temperature_check"
        entityId={id}
        voteOptions={TC_VOTE_OPTIONS}
      />
      <AccountVotesSection
        entityType="temperature_check"
        entityId={id}
        voteOptions={TC_VOTE_OPTIONS}
      />
    </>
  )

  const votingContent = (
    <VotingSection
      temperatureCheckId={id}
      keyValueStoreAddress={tc.voters}
      accountsVotesResult={accountsVotesResult}
    />
  )

  const sidebar = (
    <SidebarContent
      temperatureCheck={tc}
      id={id}
      accountsVotesResult={accountsVotesResult}
    />
  )

  return (
    <DetailPageLayout
      header={header}
      details={details}
      sidebar={sidebar}
      resultsContent={resultsContent}
      votingContent={votingContent}
    />
  )
}
