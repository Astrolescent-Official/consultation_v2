import { describe, expect, it } from 'vitest'
import {
  batchTransactionToast,
  transactionErrorMessage,
  walletErrorMessage
} from './walletError'

describe('walletErrorMessage', () => {
  it('extracts a Scrypto panic and removes its source location', () => {
    expect(
      walletErrorMessage({
        error: 'failedToPrepareTransaction',
        message:
          "Error when generating TX preview: ApplicationError(PanicMessage('Voting has not started yet @ src/governance.rs:865:13'))"
      })
    ).toBe('Voting has not started yet')
  })

  it('supports double-quoted panic messages', () => {
    expect(
      walletErrorMessage({
        error: 'failedToPrepareTransaction',
        message:
          'Error when generating TX preview: ApplicationError(PanicMessage("Voting has ended @ src/governance.rs:900:10"))'
      })
    ).toBe('Voting has ended')
  })

  it('handles escaped quotes inside a panic message', () => {
    expect(
      walletErrorMessage({
        error: 'failedToPrepareTransaction',
        message:
          "ApplicationError(PanicMessage('You can\\'t vote yet @ src/governance.rs:865:13'))"
      })
    ).toBe("You can't vote yet")
  })

  it('preserves a wallet message when it is not a Scrypto panic', () => {
    expect(
      walletErrorMessage({
        error: 'failedToSubmitTransaction',
        message: 'Gateway is temporarily unavailable'
      })
    ).toBe('Gateway is temporarily unavailable')
  })

  it('uses an actionable fallback for a wallet error code', () => {
    expect(walletErrorMessage({ error: 'failedToPrepareTransaction' })).toBe(
      'The transaction could not be prepared'
    )
  })
})

describe('batchTransactionToast', () => {
  it('reports an all-failed batch as an error with the wallet reason', () => {
    expect(
      batchTransactionToast(
        [{ success: false, error: 'Voting has not started yet' }],
        'vote'
      )
    ).toEqual({
      severity: 'error',
      message: 'Voting has not started yet'
    })
  })

  it('reports a partially completed batch as a warning', () => {
    expect(
      batchTransactionToast(
        [{ success: true }, { success: false, error: 'Voting has ended' }],
        'ballot'
      )
    ).toEqual({
      severity: 'warning',
      message: '1 submitted, 1 failed: Voting has ended'
    })
  })

  it('deduplicates repeated failure reasons', () => {
    expect(
      batchTransactionToast(
        [
          { success: false, error: 'Voting has ended' },
          { success: false, error: 'Voting has ended' }
        ],
        'vote'
      )
    ).toEqual({
      severity: 'error',
      message: 'Voting has ended'
    })
  })
})

describe('transactionErrorMessage', () => {
  it('normalizes a typed wallet error without relying on instanceof', () => {
    expect(
      transactionErrorMessage(
        {
          _tag: 'WalletErrorResponse',
          error: 'failedToPrepareTransaction',
          message:
            "ApplicationError(PanicMessage('Voting has not started yet @ src/governance.rs:865:13'))"
        },
        'Vote failed'
      )
    ).toBe('Voting has not started yet')
  })

  it('falls back when an unknown error has no message', () => {
    expect(transactionErrorMessage({ reason: 'unknown' }, 'Vote failed')).toBe(
      'Vote failed'
    )
  })
})
