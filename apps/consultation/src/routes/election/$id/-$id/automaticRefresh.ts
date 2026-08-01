const AUTOMATIC_REFRESH_DELAYS_MS = [3_000, 6_000, 12_000, 24_000, 48_000]

export const automaticElectionRefreshDelay = (attempt: number) =>
  AUTOMATIC_REFRESH_DELAYS_MS[attempt]
