import {
  Button,
  Callout,
  Field,
  Form,
  Inline,
  Input,
  List,
  Row,
  Section,
  Stack,
  Text,
  Textarea,
  TextLink,
} from '@planner/frontend'
import { appStoreCredentialsInput, type Integration } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { pickFile } from '../lib/files'
import { type FieldErrors, parseForm } from '../lib/form'
import { useTRPC } from '../lib/trpc'

export function AppStoreIntegration({ projectId, integration }: { projectId: string; integration?: Integration }) {
  const [editing, setEditing] = useState(false)
  const showForm = !integration || editing

  return (
    <Section title="App Store Connect">
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

function CredentialsForm({
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
  const [errors, setErrors] = useState<FieldErrors>({})
  const [keyId, setKeyId] = useState('')
  const [privateKey, setPrivateKey] = useState('')

  const connect = useMutation(
    trpc.integrations.connectAppStore.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.integrations.pathFilter())
        onDone()
      },
    }),
  )

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { data, errors } = parseForm(e, appStoreCredentialsInput)
    setErrors(errors)
    if (data) connect.mutate({ projectId, ...data })
  }

  const onChooseFile = async () => {
    const file = await pickFile('.p8')
    if (!file) return
    setPrivateKey(await file.text())
    setErrors((prev) => ({ ...prev, privateKey: undefined }))
    // Apple names the download AuthKey_<Key ID>.p8.
    const fromName = /^AuthKey_([A-Z0-9]+)/i.exec(file.name)?.[1]
    if (fromName && !keyId) setKeyId(fromName)
  }

  return (
    <>
      <Callout title="Where to get the key">
        <List ordered>
          <li>
            In App Store Connect, open{' '}
            <TextLink href="https://appstoreconnect.apple.com/access/integrations/api" target="_blank" rel="noreferrer">
              Users and Access → Integrations → App Store Connect API
            </TextLink>
            , Team Keys tab. Only the Account Holder or an Admin can create keys.
          </li>
          <li>Click Generate API Key (or +), name it, and give it the App Manager role.</li>
          <li>Download the key. It is an AuthKey_&lt;Key ID&gt;.p8 file, and Apple lets you download it only once.</li>
          <li>Copy the Issuer ID shown above the keys table. The Key ID is in the key's row.</li>
        </List>
      </Callout>
      <Form onSubmit={onSubmit} error={connect.error?.message} noValidate>
        <Field label="Issuer ID" error={errors.issuerId}>
          <Input name="issuerId" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Key ID" error={errors.keyId}>
          <Input
            name="keyId"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field
          label="Private key (.p8)"
          error={errors.privateKey}
          action={
            <Button size="sm" onClick={onChooseFile}>
              Choose file…
            </Button>
          }
        >
          <Textarea
            name="privateKey"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="Choose the .p8 file, or paste its contents: -----BEGIN PRIVATE KEY-----…"
            spellCheck={false}
          />
        </Field>
        <Inline>
          <Button type="submit" variant="primary" size="lg" disabled={connect.isPending}>
            {connect.isPending ? 'Checking with Apple…' : 'Connect'}
          </Button>
          {onCancel && (
            <Button type="button" size="lg" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </Inline>
      </Form>
    </>
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
  const remoteApps = useQuery(
    trpc.integrations.remoteApps.queryOptions(
      { projectId, integrationId: integration.id },
      { enabled: integration.status === 'connected', staleTime: 60_000 },
    ),
  )
  const projectApps = useQuery(trpc.apps.list.queryOptions({ projectId }))
  const importApp = useMutation(
    trpc.apps.importFromStore.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.apps.list.queryFilter({ projectId })),
    }),
  )
  const importedIds = new Set(projectApps.data?.map((a) => a.externalId))

  const checked = integration.lastVerifiedAt ? new Date(integration.lastVerifiedAt).toLocaleString() : 'never'

  return (
    <>
      <Stack>
        <Row secondary={`Key ${integration.metadata.keyId}`}>
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
          {remoteApps.isPending && <Text>Loading apps…</Text>}
          {remoteApps.error && <Text>{remoteApps.error.message}</Text>}
          {remoteApps.data?.length === 0 && <Text>No apps are visible to this key.</Text>}
          {remoteApps.data?.map((app) => (
            <Row
              key={app.id}
              secondary={
                importedIds.has(app.id) ? (
                  'Added'
                ) : (
                  <Button
                    onClick={() => importApp.mutate({ projectId, integrationId: integration.id, externalId: app.id })}
                    disabled={importApp.isPending}
                  >
                    Add
                  </Button>
                )
              }
            >
              {app.name}
            </Row>
          ))}
          {importApp.error && <Text>{importApp.error.message}</Text>}
        </Stack>
      )}
    </>
  )
}
