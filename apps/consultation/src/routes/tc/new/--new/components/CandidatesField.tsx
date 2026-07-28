import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { withForm } from '../formHook'
import {
  type CandidateFormValue,
  createCandidate,
  temperatureCheckFormOpts
} from '../formOptions'

export const parseCandidateLinks = (value: string) =>
  value
    .split(',')
    .map((link) => link.trim())
    .slice(0, 5)

export const CandidatesField = withForm({
  ...temperatureCheckFormOpts,
  render: function Render({ form }) {
    return (
      <form.Field name="candidates" mode="array">
        {(field) => {
          const candidates: CandidateFormValue[] = field.state.value
          return (
            <FieldGroup>
              {candidates.map((candidate, index) => (
                <div
                  key={candidate.id}
                  className="space-y-3 rounded-md border p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Candidate {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove candidate ${index + 1}`}
                      disabled={candidates.length <= 2}
                      onClick={() => field.removeValue(index)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <form.Field name={`candidates[${index}].reference`}>
                      {(candidateField) => (
                        <Field>
                          <Input
                            value={candidateField.state.value}
                            onChange={(event) =>
                              candidateField.handleChange(event.target.value)
                            }
                            placeholder="Stable nomination reference"
                            aria-label={`Candidate ${index + 1} reference`}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name={`candidates[${index}].displayName`}>
                      {(candidateField) => (
                        <Field>
                          <Input
                            value={candidateField.state.value}
                            onChange={(event) =>
                              candidateField.handleChange(event.target.value)
                            }
                            placeholder="Display name"
                            aria-label={`Candidate ${index + 1} name`}
                          />
                        </Field>
                      )}
                    </form.Field>
                  </div>
                  <form.Field name={`candidates[${index}].description`}>
                    {(candidateField) => (
                      <Field>
                        <Textarea
                          value={candidateField.state.value}
                          onChange={(event) =>
                            candidateField.handleChange(event.target.value)
                          }
                          placeholder="Candidate profile"
                          aria-label={`Candidate ${index + 1} profile`}
                        />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name={`candidates[${index}].links`}>
                    {(candidateField) => (
                      <Field>
                        <Input
                          value={candidateField.state.value.join(', ')}
                          onChange={(event) =>
                            candidateField.handleChange(
                              parseCandidateLinks(event.target.value)
                            )
                          }
                          placeholder="Profile links, comma-separated (up to 5)"
                          aria-label={`Candidate ${index + 1} links`}
                        />
                      </Field>
                    )}
                  </form.Field>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                disabled={candidates.length >= 20}
                onClick={() => field.pushValue(createCandidate())}
              >
                <PlusIcon className="size-4" />
                Add candidate
              </Button>
              {field.state.meta.isTouched && !field.state.meta.isValid ? (
                <FieldError errors={field.state.meta.errors} />
              ) : null}
            </FieldGroup>
          )
        }}
      </form.Field>
    )
  }
})
