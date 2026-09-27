import { Button, Field, Form, Inline, Input, Row, Section, Select, Stack, Text } from '@planner/frontend'
import { type Integration, TRANSLATION_MODELS, translationSettingsInput } from '@planner/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { type FieldErrors, parseForm } from '../lib/form'
import { useTRPC } from '../lib/trpc'

export function TranslationIntegration({ projectId, integration }: { projectId: string; integration?: Integration }) {
  const [editing, setEditing] = useState(false)
  const showForm = !integration || editing

  return (
    <Section title="Translation">
      {integration && !showForm && (
        <ConnectedView projectId={projectId} integration={integration} onReplace={() => setEditing(true)} />
      )}
      {showForm && (
        <SettingsForm
          projectId={projectId}
          onDone={() => setEditing(false)}
          onCancel={integration ? () => setEditing(false) : undefined}
        />
      )}
    </Section>
  )
}

function SettingsForm({
  projectId,
  onDone,
  onCancel,
}: {
  projectId: string
  onDone: () => void
  onCancel?: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<'llm' | 'deepl'>('llm')
  const [errors, setErrors] = useState<FieldErrors>({})

  const connect = useMutation(
    trpc.integrations.connectTranslation.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.integrations.pathFilter())
        onDone()
      },
    }),
  )

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { data, errors } = parseForm(e, translationSettingsInput)
    setErrors(errors)
    if (data) connect.mutate({ projectId, settings: data })
  }

  return (
    <Form onSubmit={onSubmit} error={connect.error?.message} noValidate>
      <Field label="Provider">
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as 'llm' | 'deepl')}>
          <option value="llm">LLM</option>
          <option value="deepl">DeepL</option>
        </Select>
      </Field>
      {kind === 'llm' ? (
        <Field label="Model" error={errors.model}>
          <Select name="model" defaultValue={TRANSLATION_MODELS[0].id}>
            {TRANSLATION_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Plan" error={errors.plan}>
          <Select name="plan" defaultValue="free">
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </Select>
        </Field>
      )}
      <Field label="API key" error={errors.apiKey}>
        <Input name="apiKey" type="password" autoComplete="off" spellCheck={false} />
      </Field>
      <Inline>
        <Button type="submit" variant="primary" size="lg" disabled={connect.isPending}>
          {connect.isPending ? 'Checking…' : 'Connect'}
        </Button>
        {onCancel && (
          <Button type="button" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </Inline>
    </Form>
  )
}

function ConnectedView({
  projectId,
  integration,
  onReplace,
}: {
  projectId: string
  integration: Integration
  onReplace: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries(trpc.integrations.pathFilter())
  const verify = useMutation(trpc.integrations.verify.mutationOptions({ onSuccess: invalidate }))
  const remove = useMutation(trpc.integrations.remove.mutationOptions({ onSuccess: invalidate }))
  const checked = integration.lastVerifiedAt ? new Date(integration.lastVerifiedAt).toLocaleString() : 'never'

  return (
    <>
      <Stack>
        <Row secondary={integration.metadata.label}>
          {integration.status === 'connected' ? 'Connected' : 'Connection failed'}
        </Row>
        <Text>{integration.status === 'connected' ? `Checked ${checked}` : integration.lastError}</Text>
      </Stack>
      <Inline>
        <Button onClick={() => verify.mutate({ projectId, integrationId: integration.id })} disabled={verify.isPending}>
          {verify.isPending ? 'Checking…' : 'Check connection'}
        </Button>
        <Button onClick={onReplace}>Replace key</Button>
        <Button onClick={() => remove.mutate({ projectId, integrationId: integration.id })} disabled={remove.isPending}>
          Disconnect
        </Button>
      </Inline>
    </>
  )
}
