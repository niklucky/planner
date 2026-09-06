import { Button, Dialog, Field, Form, Input } from '@planner/frontend'
import { createProjectInput } from '@planner/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { type FieldErrors, parseForm } from '../lib/form'
import { useTRPC } from '../lib/trpc'

/** Shown when the user has no projects yet. Can't be dismissed. */
export function CreateProjectDialog() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<FieldErrors>({})

  const create = useMutation(
    trpc.projects.create.mutationOptions({
      onSuccess: async (project) => {
        await queryClient.invalidateQueries(trpc.projects.list.queryFilter())
        navigate({ to: '/projects/$projectId', params: { projectId: project.id } })
      },
    }),
  )

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { data, errors } = parseForm(e, createProjectInput)
    setErrors(errors)
    if (data) create.mutate(data)
  }

  return (
    <Dialog open title="Create your first project">
      <Form onSubmit={onSubmit} error={create.error?.message} noValidate>
        <Field label="Name" error={errors.name}>
          <Input name="name" autoFocus />
        </Field>
        <Button type="submit" variant="primary" size="lg" block disabled={create.isPending}>
          Create project
        </Button>
      </Form>
    </Dialog>
  )
}
