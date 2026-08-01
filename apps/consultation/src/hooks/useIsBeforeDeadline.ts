import { useEffect, useState } from 'react'

/**
 * Whether the deadline is still in the future, re-rendering exactly once when
 * it passes so a page opened before a deadline closes its controls without a
 * reload.
 */
export function useIsBeforeDeadline(deadline: Date): boolean {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const remaining = deadline.getTime() - now
    if (remaining <= 0) return
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(remaining, 2_147_483_647)
    )
    return () => window.clearTimeout(timer)
  }, [deadline, now])

  return now < deadline.getTime()
}
