import { Check, CircleHelp, ThumbsDown, ThumbsUp } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import {
  TC_BALLOT_HEADING,
  TC_BALLOT_SUBHEADING,
  TC_READINESS_HELP,
  type TemperatureCheckBallotWording
} from '@/lib/tcBallotWording'

export type Vote = 'For' | 'Against'

const VOTES = ['For', 'Against'] as const

const READINESS_LABELS: Record<Vote, string> = {
  For: 'Ready for a vote',
  Against: 'Not ready'
}

type TemperatureCheckBallotOptionsProps = {
  wording: TemperatureCheckBallotWording
  selectedVote: Vote | null
  onSelect: (vote: Vote) => void
  /** False renders the read-only "Your Vote" view. */
  interactive: boolean
  disabled: boolean
}

export function TemperatureCheckBallotHeading({
  wording
}: {
  wording: TemperatureCheckBallotWording
}) {
  if (wording === 'legacy') return null
  return (
    <div className="mb-4">
      <p className="text-sm font-semibold text-foreground">
        {TC_BALLOT_HEADING}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {TC_BALLOT_SUBHEADING}
      </p>
    </div>
  )
}

export function TemperatureCheckBallotOptions({
  wording,
  selectedVote,
  onSelect,
  interactive,
  disabled
}: TemperatureCheckBallotOptionsProps) {
  return (
    <div className="flex flex-col gap-3">
      {VOTES.map((vote) => (
        <BallotOption
          key={vote}
          vote={vote}
          wording={wording}
          isSelected={selectedVote === vote}
          onSelect={onSelect}
          interactive={interactive}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

function BallotOption({
  vote,
  wording,
  isSelected,
  onSelect,
  interactive,
  disabled
}: {
  vote: Vote
  wording: TemperatureCheckBallotWording
  isSelected: boolean
  onSelect: (vote: Vote) => void
  interactive: boolean
  disabled: boolean
}) {
  const helpId = useId()
  const label =
    wording === 'legacy' ? vote.toUpperCase() : READINESS_LABELS[vote]
  const help = wording === 'legacy' ? undefined : TC_READINESS_HELP[wording]

  const content = (
    <>
      <span
        className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
          isSelected ? 'border-current bg-current/20' : 'border-current'
        }`}
      >
        {isSelected && <Check className="size-3" />}
      </span>
      <span className="flex items-center gap-2 text-left">
        {vote === 'For' ? (
          <ThumbsUp className="size-4 shrink-0" />
        ) : (
          <ThumbsDown className="size-4 shrink-0" />
        )}
        {label}
      </span>
    </>
  )

  const base = `w-full flex items-center gap-3 px-4 py-3 text-sm border ${
    help ? 'pr-12' : ''
  }`

  const row = interactive ? (
    <button
      type="button"
      onClick={() => onSelect(vote)}
      disabled={disabled}
      aria-pressed={isSelected}
      aria-describedby={help ? helpId : undefined}
      className={`${base} transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'bg-primary text-primary-foreground border-primary font-medium'
          : 'bg-transparent border-border text-foreground hover:border-muted-foreground hover:bg-secondary/50'
      }`}
    >
      {content}
    </button>
  ) : (
    <div
      aria-describedby={help ? helpId : undefined}
      className={`${base} transition-all ${
        isSelected
          ? 'bg-primary text-primary-foreground border-primary font-medium'
          : 'bg-muted border-border text-muted-foreground'
      }`}
    >
      {content}
    </div>
  )

  if (!help) return row
  return (
    <HelpTip id={helpId} label={label} text={help[vote]} onPrimary={isSelected}>
      {row}
    </HelpTip>
  )
}

// The trigger is a sibling of the vote button (nested buttons are invalid
// HTML), positioned inside its box. Opens on mouse hover, keyboard focus, or
// tap/click, and never selects a vote.
function HelpTip({
  id,
  label,
  text,
  onPrimary,
  children
}: {
  id: string
  label: string
  text: string
  onPrimary: boolean
  children: ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hovered || focused || pinned
  const popoverId = `${id}-popover`

  return (
    <div>
      <div className="relative">
        {children}
        {/* Always in the DOM so screen readers announce it with the label. */}
        <span id={id} className="sr-only">
          {text}
        </span>
        <button
          type="button"
          aria-label={`What does “${label}” mean?`}
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setPinned((value) => !value)
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') setHovered(true)
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') setHovered(false)
          }}
          onFocus={(event) => {
            // Keyboard focus only; a tap is handled by onClick.
            if (isFocusVisible(event.currentTarget)) setFocused(true)
          }}
          onBlur={() => {
            setFocused(false)
            setPinned(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setFocused(false)
              setPinned(false)
              setHovered(false)
            }
          }}
          className={`absolute right-2 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-full cursor-help transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            onPrimary
              ? 'text-primary-foreground/80 hover:text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <CircleHelp className="size-4" aria-hidden="true" />
        </button>
      </div>
      {open ? (
        // In flow rather than overlaid, so it never covers the other choice.
        <div
          id={popoverId}
          aria-hidden="true"
          className="mt-1 border border-border bg-popover px-4 py-2 text-xs text-popover-foreground"
        >
          {text}
        </div>
      ) : null}
    </div>
  )
}

function isFocusVisible(element: Element) {
  try {
    return element.matches(':focus-visible')
  } catch {
    return true
  }
}
