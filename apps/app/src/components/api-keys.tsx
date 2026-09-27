import { Button, Callout, Field, Form, Inline, Input, Row, Section, Stack, Text } from '@planner/frontend'
import { createApiKeyInput } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { type FieldErrors, parseForm } from '../lib/form'
import { useTRPC } from '../lib/trpc'

/** Read-only keys for published content, sent by an app's proxy (never shipped inside an app). */
export function ApiKeys({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: keys = [] } = useQuery(trpc.onboardings.apiKeys.queryOptions({ projectId }))
  const { data: publicUrl } = useQuery(trpc.onboardings.publicUrl.queryOptions({ projectId }))
  const [errors, setErrors] = useState<FieldErrors>({})
  const invalidate = () => queryClient.invalidateQueries(trpc.onboardings.apiKeys.queryFilter({ projectId }))
  const create = useMutation(trpc.onboardings.createApiKey.mutationOptions({ onSuccess: invalidate }))
  const revoke = useMutation(trpc.onboardings.revokeApiKey.mutationOptions({ onSuccess: invalidate }))

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { data, errors } = parseForm(e, createApiKeyInput)
    setErrors(errors)
    if (data) {
      create.mutate({ projectId, name: data.name })
      e.currentTarget.reset()
    }
  }

  return (
    <Section title="API keys">
      <Text>
        Read-only access to published onboardings at {publicUrl ?? '…/public/v1'}. Put a key in the app's proxy (as
        Authorization: Bearer …), not in the app: anything in an app binary can be read out of it.
      </Text>
      <Stack>
        {keys.map((k) => (
          <Row
            key={k.id}
            secondary={
              <Inline>
                {k.lastUsedAt ? `used ${k.lastUsedAt.toLocaleString()}` : 'never used'}
                {isOwner && (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (confirm(`Revoke ${k.name}? Whatever uses it gets 401 at once.`))
                        revoke.mutate({ projectId, apiKeyId: k.id })
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </Inline>
            }
          >
            {k.name} · {k.prefix}…
          </Row>
        ))}
        {keys.length === 0 && <Text>No keys yet.</Text>}
      </Stack>
      {create.data && (
        <Callout tone="warning" title={`New key for ${create.data.name}: copy it now, it is shown once`}>
          <code>{create.data.token}</code>
        </Callout>
      )}
      {isOwner ? (
        <Form onSubmit={onSubmit} error={create.error?.message ?? revoke.error?.message} noValidate>
          <Field label="New key name" error={errors.name}>
            <Input name="name" placeholder="capsule nginx" />
          </Field>
          <Inline>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              Create key
            </Button>
          </Inline>
        </Form>
      ) : (
        <Text>Only the project owner can create and revoke keys.</Text>
      )}
    </Section>
  )
}
