import { Registry } from '@effect-atom/atom-react'
import type * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as ParseResult from 'effect/ParseResult'
import { AdminBadgeNotFoundError } from 'shared/governance/index'
import { type ExternalToast, toast } from 'sonner'
import { WalletErrorResponse } from '@/lib/dappToolkit'
import { NoAccountConnectedError } from '@/lib/selectedAccount'
import {
  type BatchTransactionToast,
  walletErrorMessage
} from '@/lib/walletError'

type ToastMessage = React.ReactNode | string

type ToastCompletion = ToastMessage | BatchTransactionToast

type ToastOptions<A, E, Args extends ReadonlyArray<unknown>> = {
  whenLoading:
    | string
    | React.ReactNode
    | ((args: {
        registry: Registry.Registry
        args: Args
      }) => React.ReactNode | string)
  whenSuccess:
    | ToastCompletion
    | ((args: {
        registry: Registry.Registry
        result: A
        args: Args
      }) => ToastCompletion)
  whenFailure:
    | string
    | React.ReactNode
    | ((args: {
        registry: Registry.Registry
        cause: Cause.Cause<E>
        args: Args
      }) => Option.Option<React.ReactNode | string>)
  options?: Omit<ExternalToast, 'id'>
}

export const withToast =
  <A, E, Args extends ReadonlyArray<unknown>, R>(
    options: ToastOptions<A, E, Args>
  ) =>
  (self: Effect.Effect<A, E, R>, ...args: Args) =>
    Effect.gen(function* () {
      const registry = yield* Registry.AtomRegistry
      const toastId = toast.loading(
        typeof options.whenLoading === 'function'
          ? options.whenLoading({ registry, args })
          : options.whenLoading,
        options.options
      )
      const result = yield* self.pipe(
        Effect.tapErrorCause((cause) =>
          Effect.sync(() => {
            const message =
              typeof options.whenFailure === 'function'
                ? options.whenFailure({
                    registry,
                    cause,
                    args
                  })
                : options.whenFailure
            if (Option.isOption(message) && message._tag === 'None')
              return toast.dismiss(toastId)
            toast.error(Option.isOption(message) ? message.value : message, {
              id: toastId,
              ...options.options
            })
          })
        )
      )
      const message =
        typeof options.whenSuccess === 'function'
          ? options.whenSuccess({ registry, result, args })
          : options.whenSuccess
      if (
        typeof message === 'object' &&
        message !== null &&
        'severity' in message
      ) {
        toast[message.severity](message.message, {
          id: toastId,
          ...options.options
        })
      } else {
        toast.success(message, {
          id: toastId,
          ...options.options
        })
      }
      return result
    })

/**
 * `whenFailure` handler shared by every wallet-signed atom. These four errors
 * carry a message worth showing; anything else falls back to the caller's
 * action-specific text.
 */
export const transactionFailureMessage =
  (fallback: string) =>
  <E>({ cause }: { cause: Cause.Cause<E> }) => {
    if (cause._tag === 'Fail') {
      if (cause.error instanceof WalletErrorResponse) {
        return Option.some(walletErrorMessage(cause.error))
      }
      if (
        cause.error instanceof NoAccountConnectedError ||
        cause.error instanceof AdminBadgeNotFoundError
      ) {
        return Option.some(cause.error.message)
      }
      if (cause.error instanceof ParseResult.ParseError) {
        return Option.some(`Invalid input: ${cause.error.message}`)
      }
    }
    return Option.some(fallback)
  }
