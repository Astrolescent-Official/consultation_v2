export function hasReachedQuorum(
  votesCast: number,
  quorumThreshold: number
): boolean {
  if (votesCast <= quorumThreshold) {
    return false
  }
  return true
}
