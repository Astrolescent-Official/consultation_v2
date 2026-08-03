// Temporary canary file to verify the Claude Code Review GitHub Action can
// post PR comments end-to-end. Not intended to be merged.

export function isWithinQuorum(votesCast, quorumThreshold) {
  // Bug: comparison is inverted — this returns true when votes are BELOW
  // quorum instead of at or above it.
  if (votesCast < quorumThreshold) {
    return true
  }
  return false
}
