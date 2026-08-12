import { cn } from '@/lib/utils'

/**
 * Radix's mark is a check. This is a check inside brackets — the notation for
 * something entered into a record. Same gesture, different container,
 * different colour, no shared artwork. Paths are the design system's own
 * Wordmark, which in turn come from the radixdao.org repository.
 */
export function Wordmark({ className }: { readonly className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 text-foreground',
        className
      )}
    >
      <svg
        width="26"
        height="23"
        viewBox="0 0 30 26"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <title>Radix DAO</title>
        <path
          d="M8 3H3v20h5"
          className="stroke-foreground"
          strokeWidth="1.9"
          strokeLinecap="square"
        />
        <path
          d="M22 3h5v20h-5"
          className="stroke-foreground"
          strokeWidth="1.9"
          strokeLinecap="square"
        />
        <path
          d="M10.5 13.4l3.9 4.1L20.5 8"
          className="stroke-primary"
          strokeWidth="3.3"
          strokeLinecap="square"
        />
      </svg>
      <span className="hidden text-[1.0625rem] font-bold leading-none tracking-[0.13em] sm:inline">
        RADIX
      </span>
      <span
        aria-hidden="true"
        className="hidden h-[0.95rem] w-px bg-current opacity-35 sm:inline-block"
      />
      <span className="hidden text-[1.0625rem] font-bold leading-none tracking-[0.13em] text-primary sm:inline">
        DAO
      </span>
    </span>
  )
}
