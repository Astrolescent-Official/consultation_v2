import { Result, useAtom, useAtomValue } from '@effect-atom/atom-react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import {
  type ComponentProps,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useState
} from 'react'
import {
  DEFAULT_PARAMETER_SET_ID,
  type GovernanceParameterSet,
  type GovernanceParameterSetInput
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
import {
  formatGovernanceDuration,
  governanceDurationUnitPlural
} from '@/lib/governanceDuration'
import { formatQuorum } from '@/lib/utils'

type ParameterSetForm = {
  processType: 'Standard' | 'MajorityJudgment'
  label: string
  temperatureCheckDays: string
  temperatureCheckQuorum: string
  temperatureCheckApprovalThreshold: string
  proposalLengthDays: string
  proposalQuorum: string
  proposalApprovalThreshold: string
  votingDays: string
  electionQuorum: string
  minimumMedianGrade: string
  rerunVotingDays: string
  rerunQuorum: string
  rerunMinimumMedianGrade: string
  reserveListDays: string
}

const majorityJudgmentFields: ReadonlyArray<
  readonly [keyof ParameterSetForm, string, 'number' | 'text']
> = [
  [
    'votingDays',
    `Round one voting (${governanceDurationUnitPlural})`,
    'number'
  ],
  ['electionQuorum', 'Round one quorum (XRD)', 'text'],
  ['minimumMedianGrade', 'Round one minimum grade (0–4)', 'number'],
  [
    'rerunVotingDays',
    `Rerun voting (${governanceDurationUnitPlural})`,
    'number'
  ],
  ['rerunQuorum', 'Rerun quorum (XRD)', 'text'],
  ['rerunMinimumMedianGrade', 'Rerun minimum grade (0–4)', 'number'],
  ['reserveListDays', 'Reserve list (days)', 'number']
]

const emptyParameterSetForm: ParameterSetForm = {
  processType: 'Standard',
  label: '',
  temperatureCheckDays: '7',
  temperatureCheckQuorum: '1000000',
  temperatureCheckApprovalThreshold: '0.5',
  proposalLengthDays: '7',
  proposalQuorum: '1000000',
  proposalApprovalThreshold: '0.5',
  votingDays: '7',
  electionQuorum: '1000000',
  minimumMedianGrade: '2',
  rerunVotingDays: '5',
  rerunQuorum: '1000000',
  rerunMinimumMedianGrade: '2',
  reserveListDays: '90'
}

const toFormValues = (
  parameterSet: GovernanceParameterSet
): ParameterSetForm => {
  const common = {
    ...emptyParameterSetForm,
    processType: parameterSet.parameters._tag,
    label: parameterSet.label,
    temperatureCheckDays:
      parameterSet.parameters.temperatureCheck.votingDays.toString(),
    temperatureCheckQuorum: parameterSet.parameters.temperatureCheck.quorum,
    temperatureCheckApprovalThreshold:
      parameterSet.parameters.temperatureCheck.approvalThreshold
  }
  return parameterSet.parameters._tag === 'Standard'
    ? {
        ...common,
        proposalLengthDays:
          parameterSet.parameters.proposal.votingDays.toString(),
        proposalQuorum: parameterSet.parameters.proposal.quorum,
        proposalApprovalThreshold:
          parameterSet.parameters.proposal.approvalThreshold
      }
    : {
        ...common,
        votingDays: parameterSet.parameters.election.votingDays.toString(),
        electionQuorum: parameterSet.parameters.election.quorum,
        minimumMedianGrade:
          parameterSet.parameters.election.minimumMedianGrade.toString(),
        rerunVotingDays:
          parameterSet.parameters.election.rerunVotingDays.toString(),
        rerunQuorum: parameterSet.parameters.election.rerunQuorum,
        rerunMinimumMedianGrade:
          parameterSet.parameters.election.rerunMinimumMedianGrade.toString(),
        reserveListDays:
          parameterSet.parameters.election.reserveListDays.toString()
      }
}

const toParameterSetInput = (
  form: ParameterSetForm
): GovernanceParameterSetInput =>
  form.processType === 'Standard'
    ? {
        _tag: 'Standard',
        label: form.label,
        temperatureCheck: {
          votingDays: Number(form.temperatureCheckDays),
          quorum: form.temperatureCheckQuorum,
          approvalThreshold: form.temperatureCheckApprovalThreshold
        },
        proposal: {
          votingDays: Number(form.proposalLengthDays),
          quorum: form.proposalQuorum,
          approvalThreshold: form.proposalApprovalThreshold
        }
      }
    : {
        _tag: 'MajorityJudgment',
        label: form.label,
        temperatureCheck: {
          votingDays: Number(form.temperatureCheckDays),
          quorum: form.temperatureCheckQuorum,
          approvalThreshold: form.temperatureCheckApprovalThreshold
        },
        election: {
          votingDays: Number(form.votingDays),
          quorum: form.electionQuorum,
          minimumMedianGrade:
            Number(form.minimumMedianGrade) === 0
              ? 0
              : Number(form.minimumMedianGrade) === 1
                ? 1
                : Number(form.minimumMedianGrade) === 2
                  ? 2
                  : Number(form.minimumMedianGrade) === 3
                    ? 3
                    : 4,
          rerunVotingDays: Number(form.rerunVotingDays),
          rerunQuorum: form.rerunQuorum,
          rerunMinimumMedianGrade:
            Number(form.rerunMinimumMedianGrade) === 0
              ? 0
              : Number(form.rerunMinimumMedianGrade) === 1
                ? 1
                : Number(form.rerunMinimumMedianGrade) === 2
                  ? 2
                  : Number(form.rerunMinimumMedianGrade) === 3
                    ? 3
                    : 4,
          reserveListDays: Number(form.reserveListDays)
        }
      }

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

  const added = Result.isSuccess(result) ? result.value : null

  // Identifiers are permanent, so leaving the submitted values in place would
  // make the obvious next click fail on-ledger with "identifier already exists".
  useEffect(() => {
    if (added === null) return
    setParameterSetId('')
    setForm(emptyParameterSetForm)
  }, [added])

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
    updateGovernanceParameterSetAtom(parameterSet.id)
  )
  const [retireResult, retireParameterSet] = useAtom(
    retireGovernanceParameterSetAtom(parameterSet.id)
  )
  const [form, setForm] = useState(() => toFormValues(parameterSet))
  const isDefault = parameterSet.id === DEFAULT_PARAMETER_SET_ID

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    updateParameterSet(toParameterSetInput(form))
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
            lockProcessType
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
            disabled={isDefault || retireResult.waiting}
            title={
              isDefault
                ? 'The default parameter set cannot be retired'
                : undefined
            }
            onClick={() => retireParameterSet()}
          >
            {retireResult.waiting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
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
  setForm,
  lockProcessType = false
}: {
  idPrefix: string
  form: ParameterSetForm
  setForm: Dispatch<SetStateAction<ParameterSetForm>>
  lockProcessType?: boolean
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

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-process-type`}>Process type</Label>
        <select
          id={`${idPrefix}-process-type`}
          value={form.processType}
          disabled={lockProcessType}
          onChange={(event) => {
            const value = event.target.value
            if (value === 'Standard' || value === 'MajorityJudgment') {
              handleChange('processType', value)
            }
          }}
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="Standard">Standard proposal</option>
          <option value="MajorityJudgment">Majority Judgment election</option>
        </select>
        {lockProcessType ? (
          <p className="text-xs text-muted-foreground">
            A stable parameter-set identifier cannot change process type.
          </p>
        ) : null}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <ParameterGroup
          idPrefix={`${idPrefix}-tc`}
          title="Temperature Check"
          form={form}
          onChange={handleChange}
          daysField="temperatureCheckDays"
          quorumField="temperatureCheckQuorum"
          thresholdField="temperatureCheckApprovalThreshold"
        />
        {form.processType === 'Standard' ? (
          <ParameterGroup
            idPrefix={`${idPrefix}-gp`}
            title="Governance Proposal"
            form={form}
            onChange={handleChange}
            daysField="proposalLengthDays"
            quorumField="proposalQuorum"
            thresholdField="proposalApprovalThreshold"
          />
        ) : (
          <fieldset className="space-y-4">
            <legend className="font-medium">Majority Judgment Election</legend>
            {majorityJudgmentFields.map(([field, label, type]) => (
              <ParameterInput
                key={field}
                id={`${idPrefix}-${field}`}
                label={label}
                type={type}
                min={
                  field === 'minimumMedianGrade' ||
                  field === 'rerunMinimumMedianGrade'
                    ? '0'
                    : type === 'number'
                      ? '1'
                      : undefined
                }
                max={
                  field === 'minimumMedianGrade' ||
                  field === 'rerunMinimumMedianGrade'
                    ? '4'
                    : undefined
                }
                value={form[field]}
                onChange={(value) => handleChange(field, value)}
              />
            ))}
          </fieldset>
        )}
      </div>
    </div>
  )
}

const ParameterGroup = ({
  idPrefix,
  title,
  form,
  onChange,
  daysField,
  quorumField,
  thresholdField
}: {
  idPrefix: string
  title: string
  form: ParameterSetForm
  onChange: (field: keyof ParameterSetForm, value: string) => void
  daysField: keyof ParameterSetForm
  quorumField: keyof ParameterSetForm
  thresholdField: keyof ParameterSetForm
}) => (
  <fieldset className="space-y-4">
    <legend className="font-medium">{title}</legend>
    <ParameterInput
      id={`${idPrefix}-days`}
      label={`Voting period (${governanceDurationUnitPlural})`}
      type="number"
      min="1"
      max="65535"
      value={form[daysField]}
      onChange={(value) => onChange(daysField, value)}
    />
    <ParameterInput
      id={`${idPrefix}-quorum`}
      label="Quorum (XRD)"
      inputMode="decimal"
      value={form[quorumField]}
      onChange={(value) => onChange(quorumField, value)}
    />
    <ParameterInput
      id={`${idPrefix}-threshold`}
      label="Approval threshold (0–1)"
      inputMode="decimal"
      value={form[thresholdField]}
      onChange={(value) => onChange(thresholdField, value)}
    />
  </fieldset>
)

const ParameterInput = ({
  id,
  label,
  value,
  onChange,
  ...inputProps
}: Omit<ComponentProps<typeof Input>, 'id' | 'value' | 'onChange'> & {
  label: string
  id: string
  value: string
  onChange: (value: string) => void
}) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      required
      value={value}
      onChange={(event) => onChange(event.target.value)}
      {...inputProps}
    />
  </div>
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
        TC:{' '}
        {formatGovernanceDuration(
          parameterSet.parameters.temperatureCheck.votingDays
        )}{' '}
        · {formatQuorum(parameterSet.parameters.temperatureCheck.quorum)} quorum
        · {parameterSet.parameters.temperatureCheck.approvalThreshold} approval
      </p>
      <p className="text-muted-foreground">
        {parameterSet.parameters._tag === 'Standard'
          ? `GP: ${formatGovernanceDuration(parameterSet.parameters.proposal.votingDays)} · ${formatQuorum(parameterSet.parameters.proposal.quorum)} quorum · ${parameterSet.parameters.proposal.approvalThreshold} approval`
          : `MJ: ${formatGovernanceDuration(parameterSet.parameters.election.votingDays)} voting · ${formatQuorum(parameterSet.parameters.election.quorum)} quorum`}
      </p>
    </CardContent>
  </Card>
)
