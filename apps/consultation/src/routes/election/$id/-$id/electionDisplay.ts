import type { MajorityJudgmentElectionStatus } from 'shared/governance/index'
import type { ItemStatus } from '@/routes/-index/components/StatusBadge'

export type CandidateOutcome =
  | 'SEATED'
  | 'RESERVE'
  | 'NOT_ELECTABLE'
  | 'UNRESOLVED'
  | undefined

export const electionStatusCopy = (
  status: MajorityJudgmentElectionStatus
): string => {
  switch (status) {
    case 'PENDING':
      return 'Election scheduled'
    case 'TC_LIVE':
      return 'Candidate list review — vote For or Against'
    case 'TC_FAILED':
      return 'Candidate list not approved — this election will not proceed'
    case 'MJ_PENDING':
      return 'Candidate list approved — grading has not opened'
    case 'LIVE':
      return 'Round one voting'
    case 'ROUND_1_FAILED':
      return 'Turnout below quorum — awaiting a rerun decision'
    case 'RERUN_PENDING':
      return 'Rerun pending'
    case 'RERUN_LIVE':
      return 'Second-round voting'
    case 'TIE_UNRESOLVED':
      return 'Governance tie resolution required'
    case 'FAILED':
      return 'The rerun did not meet quorum'
    case 'FINAL':
      return 'Official result'
  }
}

export const candidateOutcomeCopy = (outcome: CandidateOutcome): string => {
  switch (outcome) {
    case 'SEATED':
      return 'Seated'
    case 'RESERVE':
      return 'Reserve'
    case 'UNRESOLVED':
      return 'Tie unresolved'
    case 'NOT_ELECTABLE':
    case undefined:
      return 'Not elected'
  }
}

/**
 * Maps the eleven Majority Judgment statuses onto the four badge states the
 * Temperature Check and Governance Proposal pages already use, so an election
 * reads the same as every other governance item in a list or a header.
 */
export const electionItemStatus = ({
  status,
  tcVotingOpen,
  votingOpen
}: {
  readonly status: MajorityJudgmentElectionStatus
  readonly tcVotingOpen: boolean
  readonly votingOpen: boolean
}): ItemStatus => {
  switch (status) {
    case 'PENDING':
    case 'MJ_PENDING':
    case 'RERUN_PENDING':
      return 'upcoming'
    case 'TC_LIVE':
      return tcVotingOpen ? 'active' : 'closed'
    case 'LIVE':
    case 'RERUN_LIVE':
      return votingOpen ? 'active' : 'closed'
    case 'FINAL':
      return 'passed'
    case 'TC_FAILED':
    case 'ROUND_1_FAILED':
    case 'TIE_UNRESOLVED':
    case 'FAILED':
      return 'closed'
  }
}

/** `1d 4h 12m` remaining until `target`, floored at zero. */
export const remainingTime = (target: Date, now: number): string => {
  const remaining = Math.max(0, target.getTime() - now)
  const totalMinutes = Math.ceil(remaining / 60_000)
  const days = Math.floor(totalMinutes / 1_440)
  const hours = Math.floor((totalMinutes % 1_440) / 60)
  const minutes = totalMinutes % 60
  return `${days}d ${hours}h ${minutes}m`
}
