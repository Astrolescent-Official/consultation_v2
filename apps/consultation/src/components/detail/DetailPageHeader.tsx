import { Calendar, ExternalLink, LinkIcon, User } from 'lucide-react'
import type { ReactNode } from 'react'
import { AddressLink } from '@/components/AddressLink'
import { formatDateTime } from '@/lib/utils'
import type { ItemStatus } from '@/routes/-index/components/StatusBadge'
import { StatusBadge } from '@/routes/-index/components/StatusBadge'

/** One voting window. Multi-phase entities pass one entry per phase. */
export type DetailPageSchedule = {
  readonly label?: string
  readonly start: Date
  readonly deadline: Date
}

type DetailPageHeaderProps = {
  status: ItemStatus
  typeBadge: string
  id: number
  title: string
  /** Single voting window. Ignored when `schedule` is provided. */
  start?: Date
  deadline?: Date
  schedule?: readonly DetailPageSchedule[]
  author?: string
  links?: readonly string[]
  quorumBadge?: ReactNode
  originBadge?: ReactNode
  /** Extra facts rendered inline after `TYPE #id`. */
  meta?: ReactNode
  /** Extra metadata rows rendered below the schedule, author and links. */
  extraMeta?: ReactNode
  /** Rendered below the metadata block, e.g. a phase banner. */
  children?: ReactNode
}

export function DetailPageMetaRow({
  icon,
  children
}: {
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="w-4 shrink-0 flex justify-center">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function DetailPageHeader({
  status,
  typeBadge,
  id,
  title,
  start,
  deadline,
  schedule,
  author,
  links = [],
  quorumBadge,
  originBadge,
  meta,
  extraMeta,
  children
}: DetailPageHeaderProps) {
  const windows =
    schedule ??
    (start !== undefined && deadline !== undefined ? [{ start, deadline }] : [])
  const externalLinks = links.filter((link) => /^https?:\/\//i.test(link))

  return (
    <div className="lg:border-b lg:border-border lg:pb-6 pb-2">
      <div className="flex items-center gap-2 mb-4">
        <StatusBadge status={status} />
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {typeBadge}
        </span>
        {quorumBadge && <div className="ml-auto">{quorumBadge}</div>}
      </div>
      {/* Title group */}
      <h1 className="text-3xl md:text-4xl font-light text-foreground leading-tight">
        {title}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          {typeBadge} #{id}
        </span>
        {meta}
        {originBadge}
      </div>

      {/* Metadata rows - consistent styling */}
      <div className="mt-6 space-y-2">
        {windows.map((window) => (
          <DetailPageMetaRow
            key={`${window.label ?? ''}-${window.start.getTime()}`}
            icon={<Calendar className="size-4" />}
          >
            {window.label ? (
              <span className="text-foreground">{window.label}: </span>
            ) : null}
            {formatDateTime(window.start)} – {formatDateTime(window.deadline)}
          </DetailPageMetaRow>
        ))}
        {author && (
          <DetailPageMetaRow icon={<User className="size-4" />}>
            <AddressLink
              address={author}
              className="text-sm text-muted-foreground"
            />
          </DetailPageMetaRow>
        )}
        {externalLinks.length > 0 && (
          <DetailPageMetaRow icon={<LinkIcon className="size-4" />}>
            <div className="flex items-center gap-4">
              {externalLinks.map((link) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground hover:underline text-sm flex items-center gap-1 min-w-0"
                >
                  <span className="truncate">{link}</span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
              ))}
            </div>
          </DetailPageMetaRow>
        )}
        {extraMeta}
      </div>
      {children}
    </div>
  )
}
