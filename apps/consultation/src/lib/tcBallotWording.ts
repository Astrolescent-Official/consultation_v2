import { Option } from 'effect'
import { calculateTemperatureCheckOutcome } from 'shared/governance/index'
import type { TemperatureCheck } from 'shared/governance/schemas'
import { formatXrd } from '@/lib/utils'
import {
  TC_READINESS_VOTE_OPTIONS,
  TC_VOTE_OPTIONS,
  type VoteOption
} from '@/lib/voting'

/**
 * - `readiness`: TC asks whether a proposal is ready for a binding vote.
 * - `readinessPoll`: same, for follow-ups that offer a multi-option poll.
 * - `legacy`: election TCs keep the original For / Against wording.
 */
export type TemperatureCheckBallotWording =
  | 'readiness'
  | 'readinessPoll'
  | 'legacy'

const ABSTAIN_LABEL = 'Abstain'

export function getTemperatureCheckBallotWording(
  followUp: TemperatureCheck['followUp']
): TemperatureCheckBallotWording {
  if (followUp._tag !== 'StandardProposal') return 'legacy'
  const choices = followUp.voteOptions.filter(
    ({ label }) => label !== ABSTAIN_LABEL
  )
  return choices.length > 2 || followUp.maxSelections > 1
    ? 'readinessPoll'
    : 'readiness'
}

export function getTemperatureCheckVoteOptions(
  wording: TemperatureCheckBallotWording
): readonly VoteOption[] {
  return wording === 'legacy' ? TC_VOTE_OPTIONS : TC_READINESS_VOTE_OPTIONS
}

export const TC_BALLOT_HEADING =
  'Temperature Check: should this go to a binding DAO vote?'
export const TC_BALLOT_SUBHEADING =
  "You're not approving the proposal yet. That happens in the next vote."

export const TC_READINESS_HELP: Record<
  Exclude<TemperatureCheckBallotWording, 'legacy'>,
  { readonly For: string; readonly Against: string }
> = {
  readiness: {
    For: 'The proposal is complete and clear enough for the DAO to decide on.',
    Against:
      "It's incomplete, unclear, can't be carried out, or I oppose it going ahead."
  },
  readinessPoll: {
    For: 'The options are complete and fair to choose between.',
    Against:
      "An option is missing, loaded, or can't be carried out, or I oppose the poll going ahead."
  }
}

export type TemperatureCheckResultStatus = {
  readonly text: string
  readonly participation: string
}

/**
 * Informational status line under Current Results. Uses the recorded outcome
 * once the RAC has recorded one, and the weighted tally otherwise.
 */
export function getTemperatureCheckResultStatus(input: {
  readonly phase: 'upcoming' | 'active' | 'closed' | 'passed'
  readonly results: ReadonlyArray<{ vote: string; votePower: string }>
  readonly quorumXrd: string
  readonly approvalThreshold: string
  readonly outcome: Option.Option<{ readonly passed: boolean }>
}): TemperatureCheckResultStatus | undefined {
  if (input.phase === 'upcoming') return undefined

  const tally = calculateTemperatureCheckOutcome(input)
  const quorum = formatXrd(Number(input.quorumXrd))
  const participation = tally.quorumMet
    ? `Participation: ${formatXrd(Number(tally.participationXrd))} XRD (quorum of ${quorum} XRD reached)`
    : `Participation: ${formatXrd(Number(tally.participationXrd))} of ${quorum} XRD needed`

  if (input.phase === 'active') {
    const text = !tally.quorumMet
      ? `Currently: not enough votes yet (quorum ${quorum} XRD)`
      : tally.approvalMet
        ? 'Currently: going to a DAO vote'
        : 'Currently: not going to a DAO vote'
    return { text, participation }
  }

  const passed = Option.match(input.outcome, {
    onNone: () => tally.calculatedPassed,
    onSome: (outcome) => outcome.passed
  })
  const text = passed
    ? 'Passed: goes to a binding DAO vote'
    : !tally.quorumMet
      ? 'Did not pass: not enough votes'
      : 'Did not pass: can be revised and resubmitted after the 7-day cooldown'
  return { text, participation }
}
