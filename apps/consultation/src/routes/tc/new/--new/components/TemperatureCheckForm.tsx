import { Result, useAtom, useAtomValue } from '@effect-atom/atom-react'
import { useStore } from '@tanstack/react-form'
import { Option } from 'effect'
import { LoaderIcon } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { MajorityJudgmentCandidateIdSchema } from 'shared/governance/index'
import { createMajorityJudgmentElectionAtom } from '@/atom/adminAtom'
import { accountsAtom } from '@/atom/dappToolkitAtom'
import { governanceParameterSetsAtom } from '@/atom/governanceParametersAtom'
import { majorityJudgmentElectionsAtom } from '@/atom/majorityJudgmentAtom'
import { makeTemperatureCheckAtom } from '@/atom/temperatureChecksAtom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { formatGovernanceDuration } from '@/lib/governanceDuration'
import { secureShuffleCandidateIds } from '@/routes/tc/$id/-$id/components/candidateOrder'
import { useAppForm } from '../formHook'
import {
  getProposalVoteOptionLabels,
  makeMajorityJudgmentSchedule,
  temperatureCheckFormOpts
} from '../formOptions'
import {
  effectSchemaValidator,
  makeTemperatureCheckFormSchema,
  RadixTalkUrlSchema,
  ShortDescriptionSchema,
  TitleSchema
} from '../schema'
import { CandidatesField } from './CandidatesField'
import { LinksField } from './LinksField'
import { MarkdownUploadField } from './MarkdownUploadField'
import { MaxSelectionsField } from './MaxSelectionsField'
import { SubmissionErrorSummary } from './SubmissionErrorSummary'
import { VoteOptionsField } from './VoteOptionsField'

type TemperatureCheckFormProps = {
  maxVoteOptions?: number
  onSuccess?: (result: CreatedConsultation) => void
}

export type CreatedConsultation = {
  readonly temperature_check_id: number
  readonly election_id?: number
}

export function TemperatureCheckForm({
  maxVoteOptions = 10,
  onSuccess
}: TemperatureCheckFormProps) {
  const [makeResult, makeTemperatureCheck] = useAtom(makeTemperatureCheckAtom)
  const [makeElectionResult, makeElection] = useAtom(
    createMajorityJudgmentElectionAtom
  )
  const accountsResult = useAtomValue(accountsAtom)
  const parameterSetsResult = useAtomValue(governanceParameterSetsAtom)
  const electionsResult = useAtomValue(majorityJudgmentElectionsAtom)
  const isAdmin = useIsAdmin()
  const formId = useId()
  const titleId = `${formId}-title`
  const shortDescriptionId = `${formId}-shortDescription`

  const activeParameterSets = Result.isSuccess(parameterSetsResult)
    ? parameterSetsResult.value.active
    : []

  const form = useAppForm({
    ...temperatureCheckFormOpts,
    validators: {
      // Built per-submission from the actually-selected parameter set's own
      // voting-window minimums, since the contract's minimum durations are
      // parameter-set- and network-specific rather than a fixed constant.
      onSubmit: ({ value }) => {
        const matchedParameterSet = activeParameterSets.find(
          ({ id }) => id === value.parameterSetId
        )
        const minimums =
          matchedParameterSet?.parameters._tag === 'MajorityJudgment'
            ? {
                temperatureCheckVotingUnits:
                  matchedParameterSet.parameters.temperatureCheck.votingDays,
                electionVotingUnits:
                  matchedParameterSet.parameters.election.votingDays
              }
            : undefined
        return effectSchemaValidator(makeTemperatureCheckFormSchema(minimums))({
          value:
            value.processType === 'Standard' && !isAdmin
              ? { ...value, includeAbstain: true }
              : value
        })
      }
    },
    onSubmit: ({ value }) => {
      const allLinks = [
        value.radixTalkUrl,
        ...value.links.filter((link) => link.trim() !== '')
      ]
      const common = {
        parameterSetId: value.parameterSetId,
        title: value.title,
        shortDescription: value.shortDescription,
        description: value.description,
        links: allLinks
      }
      if (value.processType === 'Standard') {
        makeTemperatureCheck({
          ...common,
          followUp: {
            _tag: 'StandardProposal',
            voteOptions: getProposalVoteOptionLabels({
              voteOptions: value.voteOptions,
              maxSelections: value.maxSelections,
              includeAbstain: value.includeAbstain,
              isAdmin
            }),
            maxSelections: value.maxSelections
          }
        })
        return
      }

      const candidates = value.candidates.map((candidate) => ({
        reference: candidate.reference,
        displayName: candidate.displayName,
        description: candidate.description,
        links: candidate.links.filter((link) => link.trim().length > 0)
      }))
      const candidateIds = candidates.map((_, index) =>
        MajorityJudgmentCandidateIdSchema.make(index)
      )
      makeElection({
        ...common,
        roleId: value.roleId,
        seatCount: value.seatCount,
        candidates,
        tcVotingStart: new Date(value.tcVotingStart),
        tcVotingEnd: new Date(value.tcVotingEnd),
        votingStart: new Date(value.votingStart),
        votingEnd: new Date(value.votingEnd),
        candidateOrder: secureShuffleCandidateIds(candidateIds).map(
          (candidateId) => MajorityJudgmentCandidateIdSchema.make(candidateId)
        )
      })
    }
  })

  const optionCount = useStore(
    form.store,
    (state) => state.values.voteOptions.length
  )
  const maxSelections = useStore(
    form.store,
    (state) => state.values.maxSelections
  )
  const includeAbstain = useStore(
    form.store,
    (state) => state.values.includeAbstain
  )
  const canSubmit = useStore(form.store, (state) => state.canSubmit)
  const submitErrors = useStore(
    form.store,
    (state) => state.errorMap.onSubmit ?? []
  )
  const parameterSetId = useStore(
    form.store,
    (state) => state.values.parameterSetId
  )
  const roleId = useStore(form.store, (state) => state.values.roleId)
  const shouldIncludeAbstain =
    maxSelections === 1 && (includeAbstain || !isAdmin)

  // Auto-adjust maxSelections if it exceeds option count (useEffect prevents render-during-render)
  useEffect(() => {
    if (maxSelections > optionCount) {
      form.setFieldValue('maxSelections', optionCount)
    }
  }, [maxSelections, optionCount, form])

  // Track if onSuccess has been called to prevent duplicate calls
  const hasCalledSuccess = useRef(false)
  const scheduledMajorityJudgmentParameterSetId = useRef<string | undefined>(
    undefined
  )

  const hasAccounts =
    Result.isSuccess(accountsResult) && accountsResult.value.length > 0

  const parameterSetsLoading = Result.isInitial(parameterSetsResult)
  const parameterSetsFailed = Result.isFailure(parameterSetsResult)
  const selectedParameterSet = activeParameterSets.find(
    ({ id }) => id === parameterSetId
  )
  const isMajorityJudgment =
    selectedParameterSet?.parameters._tag === 'MajorityJudgment'
  const failedSameRoleWithinCooldown =
    isMajorityJudgment &&
    Result.isSuccess(electionsResult) &&
    electionsResult.value.some(
      (election) =>
        election.roleId === roleId.trim() &&
        Option.exists(
          election.tcOutcome,
          (outcome) =>
            !outcome.passed &&
            Date.now() - outcome.recordedAt.getTime() < 7 * 24 * 60 * 60 * 1000
        )
    )
  const makeError = isMajorityJudgment
    ? Result.isFailure(makeElectionResult)
    : Result.isFailure(makeResult)
  const makeWaiting = isMajorityJudgment
    ? makeElectionResult.waiting
    : makeResult.waiting
  const successfulResult = isMajorityJudgment
    ? Result.isSuccess(makeElectionResult)
      ? makeElectionResult.value
      : undefined
    : Result.isSuccess(makeResult)
      ? makeResult.value
      : undefined

  useEffect(() => {
    if (
      hasCalledSuccess.current ||
      !onSuccess ||
      successfulResult === undefined
    )
      return

    hasCalledSuccess.current = true
    onSuccess(successfulResult)
  }, [successfulResult, onSuccess])

  useEffect(() => {
    form.setFieldValue(
      'processType',
      isMajorityJudgment ? 'MajorityJudgment' : 'Standard'
    )
  }, [form, isMajorityJudgment])

  useEffect(() => {
    if (
      selectedParameterSet?.parameters._tag !== 'MajorityJudgment' ||
      scheduledMajorityJudgmentParameterSetId.current ===
        selectedParameterSet.id
    )
      return

    const schedule = makeMajorityJudgmentSchedule({
      temperatureCheckVotingUnits:
        selectedParameterSet.parameters.temperatureCheck.votingDays,
      electionVotingUnits: selectedParameterSet.parameters.election.votingDays
    })
    form.setFieldValue('tcVotingStart', schedule.tcVotingStart)
    form.setFieldValue('tcVotingEnd', schedule.tcVotingEnd)
    form.setFieldValue('votingStart', schedule.votingStart)
    form.setFieldValue('votingEnd', schedule.votingEnd)
    scheduledMajorityJudgmentParameterSetId.current = selectedParameterSet.id
  }, [form, selectedParameterSet])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="space-y-8"
    >
      {/* Basic Information Section */}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Basic Information
          </CardTitle>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <form.Field name="parameterSetId">
              {(field) => (
                <Field data-invalid={parameterSetsFailed}>
                  <FieldLabel htmlFor={`${formId}-parameter-set`}>
                    Governance rules
                  </FieldLabel>
                  <FieldDescription>
                    {parameterSetsLoading
                      ? 'Loading the available governance rules…'
                      : 'The selected rules are snapshotted when the Temperature Check is created.'}
                  </FieldDescription>
                  <Select
                    value={field.state.value}
                    onValueChange={field.handleChange}
                    disabled={activeParameterSets.length === 0}
                  >
                    <SelectTrigger
                      id={`${formId}-parameter-set`}
                      className="w-full"
                    >
                      <SelectValue
                        placeholder={
                          parameterSetsLoading
                            ? 'Loading…'
                            : 'Select a parameter set'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {activeParameterSets.map((parameterSet) => (
                        <SelectItem
                          key={parameterSet.id}
                          value={parameterSet.id}
                        >
                          {parameterSet.label} (v{parameterSet.version} ·{' '}
                          {parameterSet.parameters._tag === 'Standard'
                            ? 'Standard'
                            : 'Majority Judgment'}
                          )
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedParameterSet ? (
                    <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                      TC:{' '}
                      {formatGovernanceDuration(
                        selectedParameterSet.parameters.temperatureCheck
                          .votingDays
                      )}
                      {' · fixed quorum '}
                      {selectedParameterSet.parameters.temperatureCheck.quorum}{' '}
                      XRD · approval{' '}
                      {
                        selectedParameterSet.parameters.temperatureCheck
                          .approvalThreshold
                      }
                    </div>
                  ) : null}
                  {parameterSetsFailed ? (
                    <FieldError
                      errors={[
                        {
                          message:
                            'Could not load the governance parameter sets, so a Temperature Check cannot be created right now. Reload the page to try again.'
                        }
                      ]}
                    />
                  ) : null}
                </Field>
              )}
            </form.Field>

            {/* Title */}
            <form.Field
              name="title"
              validators={{
                onBlur: effectSchemaValidator(TitleSchema),
                onChange: effectSchemaValidator(TitleSchema)
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={titleId}>Title</FieldLabel>
                    <Input
                      id={titleId}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="Enter a clear, concise title"
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            {/* Short Description */}
            <form.Field
              name="shortDescription"
              validators={{
                onBlur: effectSchemaValidator(ShortDescriptionSchema),
                onChange: effectSchemaValidator(ShortDescriptionSchema)
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={shortDescriptionId}>
                      Short Description
                    </FieldLabel>
                    <Textarea
                      id={shortDescriptionId}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="A brief summary of your proposal (displayed on the page)"
                      className="min-h-[100px]"
                    />
                    <FieldDescription>
                      This summary will be displayed on the TC/GP detail pages
                    </FieldDescription>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            {/* Description (Markdown File Upload) */}
            <MarkdownUploadField form={form} />

            {/* RadixTalk URL */}
            <form.Field
              name="radixTalkUrl"
              validators={{
                onBlur: effectSchemaValidator(RadixTalkUrlSchema),
                onChange: effectSchemaValidator(RadixTalkUrlSchema)
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={`${formId}-radixTalkUrl`}>
                      RadixTalk URL
                    </FieldLabel>
                    <FieldDescription>
                      Link to the RFC discussion on RadixTalk.
                    </FieldDescription>
                    <Input
                      id={`${formId}-radixTalkUrl`}
                      name={field.name}
                      type="url"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="https://radixtalk.com/..."
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            {/* Additional Links */}
            <LinksField form={form} />
          </FieldGroup>
        </CardContent>
      </Card>

      {/* Formal continuation section */}
      <Card className="shadow-none">
        <CardContent className="pt-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mt-6 mb-2">
            {isMajorityJudgment
              ? 'Majority Judgment Election'
              : 'Governance Proposal'}
          </CardTitle>
          <CardDescription className="text-xs mb-6">
            {isMajorityJudgment
              ? 'The role, seats, and complete candidate set are committed by this Temperature Check and cannot be replaced during formal elevation.'
              : 'These options will be available if the TC is promoted to a Governance Proposal. Provide at least 2 options.'}
          </CardDescription>

          {isMajorityJudgment ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <form.Field name="roleId">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={`${formId}-role-id`}>
                        Role identifier
                      </FieldLabel>
                      <Input
                        id={`${formId}-role-id`}
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        placeholder="rac-member"
                      />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="seatCount">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={`${formId}-seat-count`}>
                        Seats
                      </FieldLabel>
                      <Input
                        id={`${formId}-seat-count`}
                        type="number"
                        min={1}
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(Number(event.target.value))
                        }
                      />
                    </Field>
                  )}
                </form.Field>
              </div>
              {failedSameRoleWithinCooldown ? (
                <p
                  role="alert"
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
                >
                  A Temperature Check for this role failed less than seven days
                  ago. The cooldown is operator-enforced; confirm the governance
                  rules before creating another election.
                </p>
              ) : null}
              <CandidatesField form={form} />
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Election schedule</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedParameterSet?.parameters._tag ===
                    'MajorityJudgment'
                      ? `The Temperature Check lasts at least ${formatGovernanceDuration(
                          selectedParameterSet.parameters.temperatureCheck
                            .votingDays
                        )} and the election at least ${formatGovernanceDuration(
                          selectedParameterSet.parameters.election.votingDays
                        )}.`
                      : 'The Temperature Check schedule length is set by the selected governance rules.'}{' '}
                    MJ grading opens only after its outcome has been recorded as
                    passed.
                  </p>
                </div>
                <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2">
                  {(
                    [
                      ['tcVotingStart', 'TC voting starts'],
                      ['tcVotingEnd', 'TC voting ends'],
                      ['votingStart', 'MJ grading starts'],
                      ['votingEnd', 'MJ grading ends']
                    ] as const
                  ).map(([name, label]) => (
                    <form.Field key={name} name={name}>
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor={`${formId}-${name}`}>
                            {label}
                          </FieldLabel>
                          <Input
                            id={`${formId}-${name}`}
                            type="datetime-local"
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                          />
                        </Field>
                      )}
                    </form.Field>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <MaxSelectionsField form={form} optionCount={optionCount} />
              <CardTitle className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Vote Options
              </CardTitle>
              <VoteOptionsField
                form={form}
                maxOptions={maxVoteOptions - (shouldIncludeAbstain ? 1 : 0)}
                isSingleChoice={maxSelections === 1}
                isAdmin={isAdmin}
              />
            </>
          )}
        </CardContent>
      </Card>

      <SubmissionErrorSummary
        subject={isMajorityJudgment ? 'Election' : 'Temperature check'}
        errors={submitErrors}
      />

      {makeError && (
        <p className="text-sm text-destructive text-center">
          Failed to create{' '}
          {isMajorityJudgment ? 'election' : 'temperature check'}. Please try
          again.
        </p>
      )}

      {/* Submit */}
      <CardFooter className="p-0">
        <Button
          type="submit"
          disabled={
            !canSubmit ||
            makeWaiting ||
            !hasAccounts ||
            (isMajorityJudgment && !isAdmin) ||
            activeParameterSets.length === 0
          }
          className="w-full py-6 text-base"
        >
          {makeWaiting ? (
            <>
              <LoaderIcon className="size-5 animate-spin" />
              Creating...
            </>
          ) : !hasAccounts ? (
            'Connect Wallet to Create'
          ) : isMajorityJudgment && !isAdmin ? (
            'Governance Operator Required'
          ) : isMajorityJudgment ? (
            'Create Election'
          ) : (
            'Submit Temperature Check'
          )}
        </Button>
      </CardFooter>
    </form>
  )
}
