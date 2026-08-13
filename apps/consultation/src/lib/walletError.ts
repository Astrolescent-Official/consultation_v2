type WalletError = {
  readonly error: string
  readonly message?: string
}

const walletErrorFallbacks: Readonly<Record<string, string>> = {
  canceledByUser: 'Transaction cancelled',
  rejectedByUser: 'Transaction rejected in wallet',
  failedToCompileTransaction: 'The transaction could not be compiled',
  failedToFindAccountWithEnoughFundsToLockFee:
    'No account has enough XRD to pay the transaction fee',
  failedToPollSubmittedTransaction:
    'The transaction was submitted, but its final status could not be confirmed',
  failedToPrepareTransaction: 'The transaction could not be prepared',
  failedToSignTransaction: 'The transaction could not be signed',
  failedToSubmitTransaction: 'The transaction could not be submitted',
  failedTransactionStatus: 'The transaction failed'
}

const panicMessagePattern =
  /PanicMessage\('((?:\\.|[^'])*)'\)|PanicMessage\("((?:\\.|[^"])*)"\)/
const sourceLocationPattern = /\s+@\s+[^\s]+:\d+:\d+\s*$/

/**
 * Turns a Radix Wallet failure into concise text suitable for the UI while
 * retaining the original response on the typed error for diagnostics.
 */
export const walletErrorMessage = (error: WalletError): string => {
  const message = error.message?.trim()
  const panicMatch = message?.match(panicMessagePattern)
  const panicMessage = panicMatch?.[1] ?? panicMatch?.[2]

  if (panicMessage !== undefined) {
    return panicMessage
      .replace(sourceLocationPattern, '')
      .replaceAll("\\'", "'")
      .replaceAll('\\"', '"')
      .trim()
  }

  if (message !== undefined && message.length > 0) return message

  return walletErrorFallbacks[error.error] ?? 'Wallet transaction failed'
}

export const transactionErrorMessage = (
  error: unknown,
  fallback: string
): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    error._tag === 'WalletErrorResponse' &&
    'error' in error &&
    typeof error.error === 'string'
  ) {
    return walletErrorMessage({
      error: error.error,
      ...('message' in error && typeof error.message === 'string'
        ? { message: error.message }
        : {})
    })
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim().length > 0
  ) {
    return error.message
  }

  return fallback
}

type BatchTransactionResult = {
  readonly success: boolean
  readonly error?: string
}

export type BatchTransactionToast =
  | string
  | {
      readonly message: string
      readonly severity: 'error' | 'warning'
    }

export const batchTransactionToast = (
  results: ReadonlyArray<BatchTransactionResult>,
  noun: string
): BatchTransactionToast => {
  const successCount = results.filter(({ success }) => success).length
  const failures = results.filter(({ success }) => !success)

  if (failures.length === 0) {
    return `${successCount} ${noun}(s) submitted`
  }

  const details = [
    ...new Set(
      failures.flatMap(({ error }) =>
        error === undefined || error.trim().length === 0 ? [] : [error]
      )
    )
  ].join('; ')
  const detailSuffix = details.length === 0 ? '' : `: ${details}`

  if (successCount === 0) {
    return {
      severity: 'error',
      message: details.length === 0 ? `All ${noun}s failed` : details
    }
  }

  return {
    severity: 'warning',
    message: `${successCount} submitted, ${failures.length} failed${detailSuffix}`
  }
}
