import { Result, useAtom, useAtomValue } from '@effect-atom/atom-react'
import { useNavigate } from '@tanstack/react-router'
import { Option } from 'effect'
import { ArrowUpRight, LoaderIcon } from 'lucide-react'
import { useCallback } from 'react'
import type {
  TemperatureCheck,
  TemperatureCheckId
} from 'shared/governance/index'
import { isAdminAtom, promoteToProposalAtom } from '@/atom/adminAtom'
import { Button } from '@/components/ui/button'
import { useCurrentAccount } from '@/hooks/useCurrentAccount'

type PromoteToProposalProps = {
  readonly temperatureCheckId: TemperatureCheckId
  readonly followUp: TemperatureCheck['followUp']
  readonly continuation: TemperatureCheck['continuation']
  readonly outcome: TemperatureCheck['outcome']
  readonly deadline: Date
}

export function PromoteToProposal({
  temperatureCheckId,
  followUp,
  continuation,
  outcome,
  deadline
}: PromoteToProposalProps) {
  if (Option.isSome(continuation)) {
    return <ContinuationBanner continuation={continuation.value} />
  }
  if (Option.isNone(outcome)) {
    return Date.now() >= deadline.getTime() ? (
      <span className="text-xs text-muted-foreground">
        Record the weighted TC outcome before creating a Governance Proposal.
      </span>
    ) : null
  }
  if (!outcome.value.passed) return null

  return (
    <AdminPromoteBadge
      temperatureCheckId={temperatureCheckId}
      followUp={followUp}
    />
  )
}

function ContinuationBanner({
  continuation
}: {
  readonly continuation: Option.Option.Value<TemperatureCheck['continuation']>
}) {
  const navigate = useNavigate()
  const isProposal = continuation._tag === 'Proposal'
  const handleNavigate = useCallback(() => {
    if (isProposal) {
      navigate({
        to: '/proposal/$id',
        params: { id: String(continuation.id) }
      })
    } else {
      navigate({
        to: '/election/$id',
        params: { id: String(continuation.id) }
      })
    }
  }, [continuation.id, isProposal, navigate])

  return (
    <button
      type="button"
      onClick={handleNavigate}
      className="inline-flex cursor-pointer items-center gap-1 bg-neutral-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-neutral-600 transition-colors hover:text-foreground dark:bg-neutral-800 dark:text-neutral-400"
    >
      {isProposal ? 'Elevated to GP' : 'Created election'} #
      {String(continuation.id)}
      <ArrowUpRight className="size-3" />
    </button>
  )
}

function AdminPromoteBadge({
  temperatureCheckId,
  followUp
}: {
  readonly temperatureCheckId: TemperatureCheckId
  readonly followUp: TemperatureCheck['followUp']
}) {
  const currentAccount = useCurrentAccount()
  if (!currentAccount) return null
  return (
    <AdminPromoteBadgeWithAddress
      temperatureCheckId={temperatureCheckId}
      followUp={followUp}
      accountAddress={currentAccount.address}
    />
  )
}

function AdminPromoteBadgeWithAddress({
  temperatureCheckId,
  followUp,
  accountAddress
}: {
  readonly temperatureCheckId: TemperatureCheckId
  readonly followUp: TemperatureCheck['followUp']
  readonly accountAddress: string
}) {
  const isAdminResult = useAtomValue(isAdminAtom(accountAddress))
  return Result.builder(isAdminResult)
    .onInitial(() => null)
    .onFailure(() => null)
    .onSuccess((isAdmin) => {
      if (!isAdmin) return null
      return followUp._tag === 'StandardProposal' ? (
        <PromoteStandard temperatureCheckId={temperatureCheckId} />
      ) : null
    })
    .render()
}

function PromoteStandard({
  temperatureCheckId
}: {
  readonly temperatureCheckId: TemperatureCheckId
}) {
  const [promoteResult, promote] = useAtom(promoteToProposalAtom)
  return (
    <Button
      type="button"
      size="sm"
      onClick={() => promote(temperatureCheckId)}
      disabled={promoteResult.waiting}
    >
      {promoteResult.waiting ? (
        <LoaderIcon className="size-3 animate-spin" />
      ) : (
        <ArrowUpRight className="size-3" />
      )}
      Create Governance Proposal
    </Button>
  )
}
