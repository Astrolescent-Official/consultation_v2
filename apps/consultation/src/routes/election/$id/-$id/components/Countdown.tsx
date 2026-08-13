import { useEffect, useState } from 'react'
import { remainingTime } from '../electionDisplay'

export function Countdown({
  label,
  target
}: {
  readonly label: string
  readonly target: Date
}) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <span>
      {label} in {remainingTime(target, now)}
    </span>
  )
}
