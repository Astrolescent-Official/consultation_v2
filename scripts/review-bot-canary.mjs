export function isWithinQuorum(votesCast, quorumThreshold) {
  if (votesCast < quorumThreshold) {
    return true
  }
  return false
}

export function hasReachedQuorum(votesCast, quorumThreshold) {
  if (votesCast <= quorumThreshold) {
    return false
  }
  return true
}
