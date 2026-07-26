import { Result, useAtom, useAtomValue } from '@effect-atom/atom-react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useState
} from 'react'
import type {
  GovernanceParameterSet,
  GovernanceParameterSetInput
} from 'shared/governance/schemas'
import { isAdminAtom } from '@/atom/adminAtom'
import {
  addGovernanceParameterSetAtom,
  governanceParameterSetsAtom,
  retireGovernanceParameterSetAtom,
  updateGovernanceParameterSetAtom
} from '@/atom/governanceParametersAtom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { H1 } from '@/components/ui/typography'
import { useCurrentAccount } from '@/hooks/useCurrentAccount'

type ParameterSetForm = {
  label: string
  temperatureCheckDays: string
  temperatureCheckQuorum: string
  temperatureCheckApprovalThreshold: string
  proposalLengthDays: string
  proposalQuorum: string
  proposalApprovalThreshold: string
}

const emptyParameterSetForm: ParameterSetForm = {
  label: '',
  temperatureCheckDays: '7',
  temperatureCheckQuorum: '1000000',
  temperatureCheckApprovalThreshold: '0.5',
  proposalLengthDays: '7',
  proposalQuorum: '1000000',
  proposalApprovalThreshold: '0.5'
}

const toFormValues = (
  parameterSet: GovernanceParameterSet
): ParameterSetForm => ({
  label: parameterSet.label,
  temperatureCheckDays: parameterSet.parameters.temperatureCheckDays.toString(),
  temperatureCheckQuorum: parameterSet.parameters.temperatureCheckQuorum,
  temperatureCheckApprovalThreshold:
    parameterSet.parameters.temperatureCheckApprovalThreshold,
  proposalLengthDays: parameterSet.parameters.proposalLengthDays.toString(),
  proposalQuorum: parameterSet.parameters.proposalQuorum,
  proposalApprovalThreshold: parameterSet.parameters.proposalApprovalThreshold
})

const toParameterSetInput = (
  form: ParameterSetForm
): GovernanceParameterSetInput => ({
  label: form.label,
  temperatureCheckDays: Number(form.temperatureCheckDays),
  temperatureCheckQuorum: form.temperatureCheckQuorum,
  temperatureCheckApprovalThreshold: form.temperatureCheckApprovalThreshold,
  proposalLengthDays: Number(form.proposalLengthDays),
  proposalQuorum: form.proposalQuorum,
  proposalApprovalThreshold: form.proposalApprovalThreshold
})

export const Page = () => {
  const currentAccount = useCurrentAccount()

  if (!currentAccount) {
    return (
      <AccessMessage message="Please connect your wallet to access the admin panel." />
    )
  }

  return <AdminGuard accountAddress={currentAccount.address} />
}

const AccessMessage = ({ message }: { message: string }) => (
  <div className="max-w-4xl mx-auto space-y-6">
    <H1>Admin Panel</H1>
    <p className="text-neutral-500">{message}</p>
    <Button variant="outline" asChild>
      <Link to="/about">Back to About</Link>
    </Button>
  </div>
)

const AdminGuard = ({ accountAddress }: { accountAddress: string }) => {
  const isAdminResult = useAtomValue(isAdminAtom(accountAddress))

  return Result.builder(isAdminResult)
    .onInitial(() => <LoadingMessage message="Checking admin status..." />)
    .onFailure(() => <AccessMessage message="Failed to verify admin status." />)
    .onSuccess((isAdmin) =>
      isAdmin ? (
        <AdminPanel />
      ) : (
        <AccessMessage message="You do not have admin access. Only accounts holding the admin badge can manage governance parameter sets." />
      )
    )
    .render()
}

const LoadingMessage = ({ message }: { message: string }) => (
  <div className="max-w-4xl mx-auto flex items-center gap-2 text-sm text-neutral-500">
    <Loader2 className="h-4 w-4 animate-spin" />
    {message}
  </div>
)

const AdminPanel = () => {
  const parameterSetsResult = useAtomValue(governanceParameterSetsAtom)

  return Result.builder(parameterSetsResult)
    .onInitial(() => <LoadingMessage message="Loading parameter sets..." />)
    .onFailure(() => (
      <AccessMessage message="Failed to load governance parameter sets." />
    ))
    .onSuccess(({ active, retired }) => (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/about" aria-label="Back to About">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <H1>Governance Parameter Sets</H1>
            <p className="text-sm text-neutral-500">
              Updates create a new version. Existing votes keep their snapshot.
            </p>
          </div>
        </div>

        <AddParameterSetForm />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Active sets</h2>
          {active.map((parameterSet) => (
            <ParameterSetEditor
              key={`${parameterSet.id}:${parameterSet.version}`}
              parameterSet={parameterSet}
            />
          ))}
        </section>

        {retired.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Retired sets</h2>
            {retired.map((parameterSet) => (
              <RetiredParameterSet
                key={parameterSet.id}
                parameterSet={parameterSet}
              />
            ))}
          </section>
        ) : null}
      </div>
    ))
    .render()
}

const AddParameterSetForm = () => {
  const [result, addParameterSet] = useAtom(addGovernanceParameterSetAtom)
  const [parameterSetId, setParameterSetId] = useState('')
  const [form, setForm] = useState(emptyParameterSetForm)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    addParameterSet({
      parameterSetId,
      ...toParameterSetInput(form)
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Add parameter set</CardTitle>
          <CardDescription>
            The ID is permanent and must use lowercase kebab-case.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="new-parameter-set-id">Parameter set ID</Label>
            <Input
              id="new-parameter-set-id"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              maxLength={64}
              value={parameterSetId}
              onChange={(event) => setParameterSetId(event.target.value)}
              placeholder="large-grants"
            />
          </div>
          <ParameterSetFields idPrefix="new" form={form} setForm={setForm} />
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={result.waiting}>
            {result.waiting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Add set
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

const ParameterSetEditor = ({
  parameterSet
}: {
  parameterSet: GovernanceParameterSet
}) => {
  const [updateResult, updateParameterSet] = useAtom(
    updateGovernanceParameterSetAtom
  )
  const [retireResult, retireParameterSet] = useAtom(
    retireGovernanceParameterSetAtom
  )
  const [form, setForm] = useState(() => toFormValues(parameterSet))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    updateParameterSet({
      parameterSetId: parameterSet.id,
      ...toParameterSetInput(form)
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{parameterSet.label}</CardTitle>
          <CardDescription>
            {parameterSet.id} · version {parameterSet.version}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ParameterSetFields
            idPrefix={`edit-${parameterSet.id}`}
            form={form}
            setForm={setForm}
          />
        </CardContent>
        <CardFooter className="gap-3">
          <Button type="submit" disabled={updateResult.waiting}>
            {updateResult.waiting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Save as version {parameterSet.version + 1}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={parameterSet.id === 'default' || retireResult.waiting}
            title={
              parameterSet.id === 'default'
                ? 'The default parameter set cannot be retired'
                : undefined
            }
            onClick={() => retireParameterSet(parameterSet.id)}
          >
            Retire
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

const ParameterSetFields = ({
  idPrefix,
  form,
  setForm
}: {
  idPrefix: string
  form: ParameterSetForm
  setForm: Dispatch<SetStateAction<ParameterSetForm>>
}) => {
  const handleChange = (field: keyof ParameterSetForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-label`}>Label</Label>
        <Input
          id={`${idPrefix}-label`}
          required
          maxLength={128}
          value={form.label}
          onChange={(event) => handleChange('label', event.target.value)}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <ParameterGroup
          idPrefix={`${idPrefix}-tc`}
          title="Temperature Check"
          days={form.temperatureCheckDays}
          quorum={form.temperatureCheckQuorum}
          threshold={form.temperatureCheckApprovalThreshold}
          onDaysChange={(value) => handleChange('temperatureCheckDays', value)}
          onQuorumChange={(value) =>
            handleChange('temperatureCheckQuorum', value)
          }
          onThresholdChange={(value) =>
            handleChange('temperatureCheckApprovalThreshold', value)
          }
        />
        <ParameterGroup
          idPrefix={`${idPrefix}-gp`}
          title="Governance Proposal"
          days={form.proposalLengthDays}
          quorum={form.proposalQuorum}
          threshold={form.proposalApprovalThreshold}
          onDaysChange={(value) => handleChange('proposalLengthDays', value)}
          onQuorumChange={(value) => handleChange('proposalQuorum', value)}
          onThresholdChange={(value) =>
            handleChange('proposalApprovalThreshold', value)
          }
        />
      </div>
    </div>
  )
}

const ParameterGroup = ({
  idPrefix,
  title,
  days,
  quorum,
  threshold,
  onDaysChange,
  onQuorumChange,
  onThresholdChange
}: {
  idPrefix: string
  title: string
  days: string
  quorum: string
  threshold: string
  onDaysChange: (value: string) => void
  onQuorumChange: (value: string) => void
  onThresholdChange: (value: string) => void
}) => (
  <fieldset className="space-y-4">
    <legend className="font-medium">{title}</legend>
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-days`}>Voting period (days)</Label>
      <Input
        id={`${idPrefix}-days`}
        type="number"
        min="1"
        max="65535"
        required
        value={days}
        onChange={(event) => onDaysChange(event.target.value)}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-quorum`}>Quorum (XRD)</Label>
      <Input
        id={`${idPrefix}-quorum`}
        inputMode="decimal"
        required
        value={quorum}
        onChange={(event) => onQuorumChange(event.target.value)}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-threshold`}>Approval threshold (0–1)</Label>
      <Input
        id={`${idPrefix}-threshold`}
        inputMode="decimal"
        required
        value={threshold}
        onChange={(event) => onThresholdChange(event.target.value)}
      />
    </div>
  </fieldset>
)

const RetiredParameterSet = ({
  parameterSet
}: {
  parameterSet: GovernanceParameterSet
}) => (
  <Card className="opacity-70">
    <CardHeader>
      <CardTitle>{parameterSet.label}</CardTitle>
      <CardDescription>
        {parameterSet.id} · version {parameterSet.version} · retired
      </CardDescription>
    </CardHeader>
    <CardContent className="grid gap-4 text-sm md:grid-cols-2">
      <p className="text-muted-foreground">
        TC: {parameterSet.parameters.temperatureCheckDays} days ·{' '}
        {parameterSet.parameters.temperatureCheckQuorum} XRD quorum ·{' '}
        {parameterSet.parameters.temperatureCheckApprovalThreshold} approval
      </p>
      <p className="text-muted-foreground">
        GP: {parameterSet.parameters.proposalLengthDays} days ·{' '}
        {parameterSet.parameters.proposalQuorum} XRD quorum ·{' '}
        {parameterSet.parameters.proposalApprovalThreshold} approval
      </p>
    </CardContent>
  </Card>
)
