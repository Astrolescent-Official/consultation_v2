import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { Page } from './-voting-power'

export const Route = createFileRoute('/about/voting-power/')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <ClientOnly>
      <Page />
    </ClientOnly>
  )
}
