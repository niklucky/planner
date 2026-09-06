import { Button, Field, Form, Inline, Input, Row, Section, Stack, Text, Textarea } from '@planner/frontend'
import { type Integration, googlePlayCredentialsInput, importGooglePlayAppInput } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { type FieldErrors, parseForm } from '../lib/form'
import { useTRPC } from '../lib/trpc'

export function GooglePlayIntegration({ projectId, integration }: { projectId: string; integration?: Integration }) {
  const [editing, setEditing] = useState(false)
  const showForm = !integration || editing

  return (
    <Section title="Google Play">
      {integration && !showForm && (
        <ConnectedView projectId={projectId} integration={integration} onReplace={() => setEditing(true)} />
      )}
      {showForm && (
        <CredentialsForm
          projectId={projectId}
          onDone={() => setEditing(false)}
          onCancel={integration ? () => setEditing(false) : undefined}
        />
      )}
    </Section>
  )
}

function CredentialsForm({ projectId, onDone, onCancel }: { projectId: string; onDone: () => void; onCancel?: () => void }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<FieldErrors>({})

  const connect = useMutation(
    trpc.integrations.connectGooglePlay.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.integrations.pathFilter())
        onDone()
      },
    }),
  )

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { data, errors } = parseForm(e, googlePlayCredentialsInput)
    setErrors(errors)
    if (data) connect.mutate({ projectId, ...data })
  }

  return (
    <Form onSubmit={onSubmit} error={connect.error?.message} noValidate>
      <Field label="Service account key (JSON)" error={errors.serviceAccountJson}>
        <Textarea name="serviceAccountJson" placeholder='{ "type": "service_account", … }' spellCheck={false} />
      </Field>
      <Inline>
        <Button type="submit" variant="primary" size="lg" disabled={connect.isPending}>
          {connect.isPending ? 'Checking with Google…' : 'Connect'}
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

function ConnectedView({ projectId, integration, onReplace }: { projectId: string; integration: Integration; onReplace: () => void }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<FieldErrors>({})
  const invalidate = () => queryClient.invalidateQueries(trpc.integrations.pathFilter())

  const verify = useMutation(trpc.integrations.verify.mutationOptions({ onSuccess: invalidate }))
  const remove = useMutation(trpc.integrations.remove.mutationOptions({ onSuccess: invalidate }))
  const projectApps = useQuery(trpc.apps.list.queryOptions({ projectId }))
  const importApp = useMutation(
    trpc.apps.importFromGooglePlay.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.apps.pathFilter()),
    }),
  )

  const onAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const { data, errors } = parseForm(e, importGooglePlayAppInput.pick({ packageName: true }))
    setErrors(errors)
    if (data) importApp.mutate({ projectId, integrationId: integration.id, packageName: data.packageName }, { onSuccess: () => form.reset() })
  }

  const checked = integration.lastVerifiedAt ? new Date(integration.lastVerifiedAt).toLocaleString() : 'never'
  const androidApps = projectApps.data?.filter((a) => a.integrationId === integration.id) ?? []

  return (
    <>
      <Stack>
        <Row secondary={integration.metadata.clientEmail}>
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

      {integration.status === 'connected' && (
        <Stack>
          {androidApps.map((app) => (
            <Row key={app.id} secondary="Added">
              {app.name} · {app.bundleId}
            </Row>
          ))}
          <Form onSubmit={onAdd} error={importApp.error?.message} noValidate>
            <Field label="Add app by package name" error={errors.packageName}>
              <Input name="packageName" placeholder="com.example.app" autoComplete="off" spellCheck={false} />
            </Field>
            <Inline>
              <Button type="submit" variant="primary" disabled={importApp.isPending}>
                {importApp.isPending ? 'Adding…' : 'Add'}
              </Button>
            </Inline>
          </Form>
        </Stack>
      )}
    </>
  )
}
