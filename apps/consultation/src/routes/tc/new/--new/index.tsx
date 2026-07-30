import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import {
  type CreatedConsultation,
  TemperatureCheckForm
} from './components/TemperatureCheckForm'

export const createdConsultationDestination = (result: CreatedConsultation) =>
  'election_id' in result
    ? { to: '/election/$id' as const, id: String(result.election_id) }
    : { to: '/tc/$id' as const, id: String(result.temperature_check_id) }

export const Page: React.FC = () => {
  const navigate = useNavigate()

  const handleSuccess = useCallback(
    (result: CreatedConsultation) => {
      const destination = createdConsultationDestination(result)
      navigate({
        to: destination.to,
        params: { id: destination.id }
      })
    },
    [navigate]
  )

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-light text-foreground tracking-tight">
          New Proposal
        </h1>
        <p className="text-muted-foreground mt-2 max-w-lg">
          Create a standard Temperature Check leading to a Governance Proposal,
          or atomically create an election whose candidate-list TC gates its
          Majority Judgment vote.
        </p>
      </div>

      <TemperatureCheckForm onSuccess={handleSuccess} />
    </div>
  )
}
