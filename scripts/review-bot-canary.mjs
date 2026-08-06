export function isWithinQuorum(votesCast, quorumThreshold) {
  if (votesCast < quorumThreshold) {
    return true
  }
  return false
}
