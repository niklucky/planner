import { Badge, Button, Field, Form, Inline, Input, Row, Section, Stack, Text } from '@planner/frontend'
import { createEnvironmentInput, type Environment } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { type FieldErrors, parseForm } from '../lib/form'
import { useTRPC } from '../lib/trpc'

/** The project's environments, production first. */
export function useEnvironments(projectId: string): Environment[] {
  const trpc = useTRPC()
  return useQuery(trpc.environments.list.queryOptions({ projectId })).data ?? []
}

/** Where published content is served: production for store builds, others (e.g. Development) for testing. */
export function Environments({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const environments = useEnvironments(projectId)
  const [errors, setErrors] = useState<FieldErrors>({})
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.environments.pathFilter()),
      queryClient.invalidateQueries(trpc.onboardings.pathFilter()),
    ])
  const create = useMutation(trpc.environments.create.mutationOptions({ onSuccess: invalidate }))
  const rename = useMutation(trpc.environments.rename.mutationOptions({ onSuccess: invalidate }))
  const remove = useMutation(trpc.environments.remove.mutationOptions({ onSuccess: invalidate }))

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { data, errors } = parseForm(e, createEnvironmentInput)
    setErrors(errors)
    if (data) {
      create.mutate({ projectId, name: data.name })
      e.currentTarget.reset()
    }
  }

  const onRename = (env: Environment) => {
    const name = prompt(`Rename ${env.name}`, env.name)?.trim()
    if (name && name !== env.name) rename.mutate({ projectId, environmentId: env.id, name })
  }

  return (
    <Section title="Environments">
      <Text>
        Each API key reads one environment. Publish to Development and check it on a dev build, then promote that same
        release to Production. An environment with nothing of its own published serves what Production serves.
      </Text>
      <Stack>
        {environments.map((env) => (
          <Row
            key={env.id}
            secondary={
              isOwner && (
                <Inline>
                  <Button size="sm" onClick={() => onRename(env)}>
                    Rename
                  </Button>
                  {!env.isProduction && (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (confirm(`Delete ${env.name}? What is published only there is no longer served.`))
                          remove.mutate({ projectId, environmentId: env.id })
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </Inline>
              )
            }
          >
            {env.name} {env.isProduction && <Badge tone="success">store builds</Badge>}
          </Row>
        ))}
      </Stack>
      {isOwner ? (
        <Form
          onSubmit={onSubmit}
          error={create.error?.message ?? rename.error?.message ?? remove.error?.message}
          noValidate
        >
          <Field label="New environment" error={errors.name}>
            <Input name="name" placeholder="Staging" />
          </Field>
          <Inline>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              Add environment
            </Button>
          </Inline>
        </Form>
      ) : (
        <Text>Only the project owner can add, rename and delete environments.</Text>
      )}
    </Section>
  )
}
