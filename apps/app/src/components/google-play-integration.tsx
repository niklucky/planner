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
import { googlePlayCredentialsInput, type Integration, importGooglePlayAppInput } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { pickTextFile } from '../lib/files'
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
  const [json, setJson] = useState('')

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

  const onChooseFile = async () => {
    const text = await pickTextFile()
    if (text === null) return
    setJson(text)
    setErrors((prev) => ({ ...prev, serviceAccountJson: undefined }))
  }

  const clientEmail = serviceAccountEmail(json)

  return (
    <>
      <Callout title="Where to get the key">
        <List ordered>
          <li>
            In Google Cloud, pick or create a project and enable the{' '}
            <TextLink
              href="https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com"
              target="_blank"
              rel="noreferrer"
            >
              Google Play Android Developer API
            </TextLink>
            .
          </li>
          <li>
            In{' '}
            <TextLink
              href="https://console.cloud.google.com/iam-admin/serviceaccounts"
              target="_blank"
              rel="noreferrer"
            >
              IAM &amp; Admin → Service accounts
            </TextLink>
            , create a service account. It needs no Google Cloud roles.
          </li>
          <li>Open the service account, go to Keys → Add key → Create new key → JSON. The file downloads.</li>
          <li>
            In Play Console,{' '}
            <TextLink href="https://play.google.com/console/users-and-permissions" target="_blank" rel="noreferrer">
              Users and permissions
            </TextLink>{' '}
            → Invite new users, enter the service account's email (client_email in the file), and give it View app
            information, Manage store presence, and the release permissions for the tracks you edit notes on.
            Permissions can take a while to apply; if Connect fails at first, try again later.
          </li>
        </List>
      </Callout>
      <Form onSubmit={onSubmit} error={connect.error?.message} noValidate>
        <Field
          label="Service account key (JSON)"
          error={errors.serviceAccountJson}
          action={
            <Button size="sm" onClick={onChooseFile}>
              Choose file…
            </Button>
          }
        >
          <Textarea
            name="serviceAccountJson"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder='Choose the .json file, or paste its contents: { "type": "service_account", … }'
            spellCheck={false}
          />
        </Field>
        {clientEmail && <Text>Service account: {clientEmail}. Invite this email in Play Console.</Text>}
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
    </>
  )
}

/** client_email from a service account key, or null while the text is not (yet) one. */
function serviceAccountEmail(json: string): string | null {
  try {
    const email = (JSON.parse(json) as { client_email?: unknown }).client_email
    return typeof email === 'string' ? email : null
  } catch {
    return null
  }
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
    if (data)
      importApp.mutate(
        { projectId, integrationId: integration.id, packageName: data.packageName },
        { onSuccess: () => form.reset() },
      )
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
