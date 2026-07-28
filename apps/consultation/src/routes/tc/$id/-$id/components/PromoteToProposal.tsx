import { Result, useAtom, useAtomValue } from '@effect-atom/atom-react'
import { useNavigate } from '@tanstack/react-router'
import { Option } from 'effect'
import { ArrowUpRight, LoaderIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import type {
  TemperatureCheck,
  TemperatureCheckId
} from 'shared/governance/index'
import { MajorityJudgmentCandidateIdSchema } from 'shared/governance/index'
import {
  isAdminAtom,
  promoteToMajorityJudgmentElectionAtom,
  promoteToProposalAtom
} from '@/atom/adminAtom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentAccount } from '@/hooks/useCurrentAccount'
import { secureShuffleCandidateIds } from './candidateOrder'

type PromoteToProposalProps = {
  readonly temperatureCheckId: TemperatureCheckId
  readonly followUp: TemperatureCheck['followUp']
  readonly continuation: TemperatureCheck['continuation']
  readonly deadline: Date
}

export function PromoteToProposal({
  temperatureCheckId,
  followUp,
  continuation,
  deadline
}: PromoteToProposalProps) {
  if (Option.isSome(continuation)) {
    return <ContinuationBanner continuation={continuation.value} />
  }

  return (
    <AdminPromoteBadge
      temperatureCheckId={temperatureCheckId}
      followUp={followUp}
      deadline={deadline}
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
  followUp,
  deadline
}: {
  readonly temperatureCheckId: TemperatureCheckId
  readonly followUp: TemperatureCheck['followUp']
  readonly deadline: Date
}) {
  const currentAccount = useCurrentAccount()
  if (!currentAccount) return null
  return (
    <AdminPromoteBadgeWithAddress
      temperatureCheckId={temperatureCheckId}
      followUp={followUp}
      deadline={deadline}
      accountAddress={currentAccount.address}
    />
  )
}

function AdminPromoteBadgeWithAddress({
  temperatureCheckId,
  followUp,
  deadline,
  accountAddress
}: {
  readonly temperatureCheckId: TemperatureCheckId
  readonly followUp: TemperatureCheck['followUp']
  readonly deadline: Date
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
      ) : (
        <PromoteElection
          temperatureCheckId={temperatureCheckId}
          followUp={followUp}
          deadline={deadline}
        />
      )
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

const tomorrowLocal = () => {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function PromoteElection({
  temperatureCheckId,
  followUp,
  deadline
}: {
  readonly temperatureCheckId: TemperatureCheckId
  readonly followUp: Extract<
    TemperatureCheck['followUp'],
    { readonly _tag: 'MajorityJudgmentElection' }
  >
  readonly deadline: Date
}) {
  const [result, promote] = useAtom(promoteToMajorityJudgmentElectionAtom)
  const [reviewStart, setReviewStart] = useState(tomorrowLocal)
  const [order, setOrder] = useState(() =>
    secureShuffleCandidateIds(followUp.candidates.map(({ id }) => Number(id)))
  )
  const ended = Date.now() >= deadline.getTime()

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium">Create Majority Judgment Election</p>
      <Input
        type="datetime-local"
        value={reviewStart}
        onChange={(event) => setReviewStart(event.target.value)}
        aria-label="Candidate review start"
      />
      <ol className="list-inside list-decimal text-xs text-muted-foreground">
        {order.map((candidateId) => (
          <li key={candidateId}>
            {followUp.candidates.find(({ id }) => Number(id) === candidateId)
              ?.displayName ?? `Candidate ${candidateId}`}
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setOrder(
              secureShuffleCandidateIds(
                followUp.candidates.map(({ id }) => Number(id))
              )
            )
          }
          disabled={result.waiting}
        >
          Shuffle again
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!ended || result.waiting || reviewStart.length === 0}
          title={
            ended
              ? undefined
              : 'The Temperature Check must end before elevation'
          }
          onClick={() =>
            promote({
              temperatureCheckId,
              reviewStart: new Date(reviewStart),
              candidateIds: followUp.candidates.map(({ id }) => id),
              candidateOrder: order.map((candidateId) =>
                MajorityJudgmentCandidateIdSchema.make(candidateId)
              )
            })
          }
        >
          {result.waiting ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : null}
          Confirm election
        </Button>
      </div>
    </div>
  )
}
