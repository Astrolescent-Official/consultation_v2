import { Result, useAtomValue } from '@effect-atom/atom-react'
import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import type { GovernanceParameterSet } from 'shared/governance/schemas'
import { isAdminAtom } from '@/atom/adminAtom'
import { governanceParameterSetsAtom } from '@/atom/governanceParametersAtom'
import { Button } from '@/components/ui/button'
import { H1 } from '@/components/ui/typography'
import { useCurrentAccount } from '@/hooks/useCurrentAccount'
import { formatGovernanceDuration } from '@/lib/governanceDuration'
import { formatApprovalThreshold, formatQuorum } from '@/lib/utils'

export const Page = () => {
  const parameterSetsResult = useAtomValue(governanceParameterSetsAtom)

  return (
    <div className="max-w-3xl mx-auto space-y-12">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <H1>About Radix Governance</H1>
            <p className="mt-2 text-lg text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Radix Governance is a decentralized governance platform for the
              Radix ecosystem. It enables the community to signal sentiment
              through Temperature Checks (TC) and decide on execution paths
              through Governance Proposals (GP).
            </p>
          </div>
          <AdminEditButton />
        </div>
      </div>

      {Result.builder(parameterSetsResult)
        .onInitial(() => (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading governance parameters...
          </div>
        ))
        .onFailure(() => (
          <div className="bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-700 dark:text-red-300">
              Failed to load governance parameters.
            </p>
          </div>
        ))
        .onSuccess(({ active }) => <GovernanceContent parameterSets={active} />)
        .render()}
    </div>
  )
}

const GovernanceContent = ({
  parameterSets
}: {
  parameterSets: ReadonlyArray<GovernanceParameterSet>
}) => (
  <>
    <div className="space-y-8">
      <h2 className="text-2xl font-medium text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-800 pb-4">
        How it Works
      </h2>

      <p className="text-neutral-600 dark:text-neutral-400">
        Each Temperature Check chooses one of the active parameter sets below.
        The selected rules are snapshotted, so later registry updates never
        change an existing vote.
      </p>

      <div className="grid gap-6">
        {parameterSets.map((parameterSet) => (
          <ParameterSetDetails
            key={parameterSet.id}
            parameterSet={parameterSet}
          />
        ))}
      </div>
    </div>

    <div className="bg-neutral-100 dark:bg-neutral-900 p-6 border border-neutral-200 dark:border-neutral-800">
      <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">
        Voting Power
      </h3>
      <p className="text-neutral-600 dark:text-neutral-400">
        Your voting power is determined by your XRD holdings. 1 XRD = 1 Vote. A
        snapshot of your balance is taken at the moment the proposal is created.
      </p>
    </div>
  </>
)

const ParameterSetDetails = ({
  parameterSet
}: {
  parameterSet: GovernanceParameterSet
}) => {
  const parameters = parameterSet.parameters

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 p-6 space-y-5">
      <div>
        <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">
          {parameterSet.label}
        </h3>
        <p className="text-sm text-neutral-500">
          {parameterSet.id} · version {parameterSet.version}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <ParameterRules
          title="Temperature Check"
          duration={parameters.temperatureCheck.votingDays}
          quorum={parameters.temperatureCheck.quorum}
          threshold={parameters.temperatureCheck.approvalThreshold}
        />
        {parameters._tag === 'Standard' ? (
          <ParameterRules
            title="Governance Proposal"
            duration={parameters.proposal.votingDays}
            quorum={parameters.proposal.quorum}
            threshold={parameters.proposal.approvalThreshold}
          />
        ) : (
          <div className="space-y-3">
            <h4 className="font-semibold text-neutral-900 dark:text-white">
              Majority Judgment Election
            </h4>
            <ul className="list-inside list-disc space-y-2 pl-2 text-sm text-neutral-500">
              <li>
                Candidate review:{' '}
                {formatGovernanceDuration(parameters.election.reviewDays)}
              </li>
              <li>
                Voting:{' '}
                {formatGovernanceDuration(parameters.election.votingDays)}
              </li>
              <li>Fixed quorum: {formatQuorum(parameters.election.quorum)}</li>
              <li>
                Rerun fixed quorum:{' '}
                {formatQuorum(parameters.election.rerunQuorum)}
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

const ParameterRules = ({
  title,
  duration,
  quorum,
  threshold
}: {
  title: string
  duration: number
  quorum: string
  threshold: string
}) => (
  <div className="space-y-3">
    <h4 className="font-semibold text-neutral-900 dark:text-white">{title}</h4>
    <ul className="list-disc list-inside text-sm text-neutral-500 space-y-2 pl-2">
      <li>Voting period: {formatGovernanceDuration(duration)}</li>
      <li>Requires {formatQuorum(quorum)} quorum</li>
      <li>Approval threshold: {formatApprovalThreshold(threshold)}</li>
    </ul>
  </div>
)

const AdminEditButton = () => {
  const currentAccount = useCurrentAccount()

  if (!currentAccount) return null

  return <AdminEditButtonWithAddress accountAddress={currentAccount.address} />
}

const AdminEditButtonWithAddress = ({
  accountAddress
}: {
  accountAddress: string
}) => {
  const isAdminResult = useAtomValue(isAdminAtom(accountAddress))

  return Result.builder(isAdminResult)
    .onInitial(() => null)
    .onFailure(() => null)
    .onSuccess((isAdmin) => {
      if (!isAdmin) return null

      return (
        <Button variant="outline" size="sm" asChild>
          <Link to="/about/admin">Edit Parameters</Link>
        </Button>
      )
    })
    .render()
}
