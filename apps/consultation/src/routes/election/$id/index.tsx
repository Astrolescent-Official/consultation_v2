import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { MajorityJudgmentElectionIdSchema } from 'shared/governance/index'
import { Page } from './-$id'

export const Route = createFileRoute('/election/$id/')({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  return (
    <ClientOnly>
      <Page electionId={MajorityJudgmentElectionIdSchema.make(Number(id))} />
    </ClientOnly>
  )
}
