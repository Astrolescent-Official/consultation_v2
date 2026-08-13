import { Result, useAtom, useAtomValue } from '@effect-atom/atom-react'
import { Cause } from 'effect'
import { Eye, EyeOff, LoaderIcon } from 'lucide-react'
import { useCallback } from 'react'
import type {
  ProposalId,
  TemperatureCheckId
} from 'shared/governance/brandedTypes'
import type { MajorityJudgmentElectionId } from 'shared/governance/index'
import {
  isAdminAtom,
  toggleMajorityJudgmentElectionHiddenAtom,
  toggleProposalHiddenAtom,
  toggleTemperatureCheckHiddenAtom
} from '@/atom/adminAtom'
import { useCurrentAccount } from '@/hooks/useCurrentAccount'

type HideToggleProps =
  | {
      type: 'temperature_check'
      id: TemperatureCheckId
      hidden: boolean
    }
  | {
      type: 'proposal'
      id: ProposalId
      hidden: boolean
    }
  | {
      type: 'election'
      id: MajorityJudgmentElectionId
      hidden: boolean
    }

export function HideToggle(props: HideToggleProps) {
  const currentAccount = useCurrentAccount()

  if (!currentAccount) return null

  return (
    <HideToggleWithAddress {...props} accountAddress={currentAccount.address} />
  )
}

function HideToggleWithAddress(
  props: HideToggleProps & { accountAddress: string }
) {
  const isAdminResult = useAtomValue(isAdminAtom(props.accountAddress))

  return Result.builder(isAdminResult)
    .onInitial(() => null)
    .onFailure((cause) => {
      console.error('Admin badge check failed:', Cause.pretty(cause))
      return null
    })
    .onSuccess((isAdmin) => {
      if (!isAdmin) return null

      return <HideToggleButton {...props} />
    })
    .render()
}

function HideToggleButton(props: HideToggleProps) {
  const [tcResult, toggleTcHidden] = useAtom(toggleTemperatureCheckHiddenAtom)
  const [proposalResult, toggleProposalHidden] = useAtom(
    toggleProposalHiddenAtom
  )
  const [electionResult, toggleElectionHidden] = useAtom(
    toggleMajorityJudgmentElectionHiddenAtom
  )

  const isSubmitting =
    props.type === 'temperature_check'
      ? tcResult.waiting
      : props.type === 'proposal'
        ? proposalResult.waiting
        : electionResult.waiting

  const handleToggle = useCallback(() => {
    if (props.type === 'temperature_check') {
      toggleTcHidden(props.id)
    } else if (props.type === 'proposal') {
      toggleProposalHidden(props.id)
    } else {
      toggleElectionHidden(props.id)
    }
  }, [
    props.type,
    props.id,
    toggleTcHidden,
    toggleProposalHidden,
    toggleElectionHidden
  ])

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isSubmitting}
      aria-label={props.hidden ? 'Unhide this item' : 'Hide this item'}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/60 transition-colors cursor-pointer disabled:opacity-50"
    >
      {isSubmitting ? (
        <LoaderIcon className="size-3 animate-spin" />
      ) : props.hidden ? (
        <Eye className="size-3" />
      ) : (
        <EyeOff className="size-3" />
      )}
      {props.hidden ? 'Unhide' : 'Hide'}
    </button>
  )
}
