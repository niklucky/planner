import { Button, Dialog, Field, Form, Inline, Input } from '@planner/frontend'
import { createOnboardingInput } from '@planner/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { type FieldErrors, parseForm } from '../lib/form'
import { useTRPC } from '../lib/trpc'

interface Props {
  projectId: string
  groupId: string
  onClose: () => void
  onCreated: (onboardingId: string) => void
}

export function NewOnboardingDialog({ projectId, groupId, onClose, onCreated }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<FieldErrors>({})
  const create = useMutation(
    trpc.onboardings.create.mutationOptions({
      onSuccess: async (row) => {
        await queryClient.invalidateQueries(trpc.onboardings.pathFilter())
        onCreated(row.id)
      },
    }),
  )

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { data, errors } = parseForm(e, createOnboardingInput.omit({ groupId: true }))
    setErrors(errors)
    if (data) create.mutate({ projectId, groupId, ...data })
  }

  return (
    <Dialog open title="New onboarding" onClose={onClose}>
      <Form onSubmit={onSubmit} error={create.error?.message} noValidate>
        <Field label="Name" error={errors.name}>
          <Input name="name" placeholder="Capsule intro" autoFocus />
        </Field>
        <Field label="Key (what the app asks for)" error={errors.key}>
          <Input name="key" placeholder="capsule-intro" />
        </Field>
        <Field label="Default language" error={errors.defaultLocale}>
          <Input name="defaultLocale" defaultValue="en" />
        </Field>
        <Inline>
          <Button type="submit" variant="primary" size="lg" disabled={create.isPending}>
            Create
          </Button>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
        </Inline>
      </Form>
    </Dialog>
  )
}
