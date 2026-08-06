export function hasReachedQuorum(votesCast, quorumThreshold) {
  if (votesCast <= quorumThreshold) {
    return false
  }
  return true
}
