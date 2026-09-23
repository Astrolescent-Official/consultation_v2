export type VoteOption = {
  readonly id: number
  readonly label: string
  /** Stored vote value when it differs from the displayed label (TCs only). */
  readonly key?: string
  /** Compact label for tight spaces such as filter tabs. */
  readonly shortLabel?: string
}

export const TC_VOTE_OPTIONS = [
  { id: 0, label: 'For' },
  { id: 1, label: 'Against' }
] as const

// Readiness wording for TCs that lead to a binding proposal vote. The stored
// vote values stay For / Against; only what voters see changes.
export const TC_READINESS_VOTE_OPTIONS = [
  { id: 0, key: 'For', label: 'Ready for a vote', shortLabel: 'Ready' },
  { id: 1, key: 'Against', label: 'Not ready', shortLabel: 'Not ready' }
] as const

export type ResolvedVoteOption = {
  key: string
  label: string
  shortLabel: string
}

export function resolveVoteOptions(
  entityType: 'temperature_check' | 'proposal',
  voteOptions: readonly VoteOption[]
): ResolvedVoteOption[] {
  const isTc = entityType === 'temperature_check'
  return voteOptions.map((opt) => ({
    key: isTc ? (opt.key ?? opt.label) : String(opt.id),
    label: opt.label,
    shortLabel: opt.shortLabel ?? opt.label
  }))
}
