export function isWithinVotingWindow(
  now: Date,
  opensAt: Date,
  closesAt: Date
): boolean {
  return now.getTime() > opensAt.getTime() && now.getTime() > closesAt.getTime()
}
