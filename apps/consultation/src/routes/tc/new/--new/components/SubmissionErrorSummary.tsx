import { FieldError } from '@/components/ui/field'

type SubmissionError = {
  readonly message?: string
}

type SubmissionErrorSummaryProps = {
  readonly errors: ReadonlyArray<SubmissionError>
  readonly subject: 'Election' | 'Temperature check'
}

export function SubmissionErrorSummary({
  errors,
  subject
}: SubmissionErrorSummaryProps) {
  if (errors.length === 0) return null

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <p className="mb-2 text-sm font-medium text-destructive">
        {subject} was not created. Fix the following details and try again:
      </p>
      <FieldError errors={errors.map(({ message }) => ({ message }))} />
    </div>
  )
}
