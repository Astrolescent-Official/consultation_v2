const UINT32_RANGE = 0x1_0000_0000

const secureRandomIndex = (exclusiveUpperBound: number) => {
  const unbiasedLimit =
    Math.floor(UINT32_RANGE / exclusiveUpperBound) * exclusiveUpperBound
  while (true) {
    const sample = new Uint32Array(1)
    globalThis.crypto.getRandomValues(sample)
    const value = sample[0] ?? 0
    if (value < unbiasedLimit) return value % exclusiveUpperBound
  }
}

export const secureShuffleCandidateIds = (
  candidateIds: ReadonlyArray<number>
) => {
  const shuffled = [...candidateIds]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomIndex(index + 1)
    const current = shuffled[index]
    const replacement = shuffled[swapIndex]
    if (current === undefined || replacement === undefined) continue
    shuffled[index] = replacement
    shuffled[swapIndex] = current
  }
  return shuffled
}
