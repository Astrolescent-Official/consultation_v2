export function formatVoteCount(count: number): string {
  if (count === 1) {
    return '1 vote'
  }
  return `${count} vote`
}
