import { Badge, Button, Callout, Inline, List, Page, Section, Stack, Text } from '@planner/frontend'
import type { AppProfile } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { AppLink, NavLink } from '../../../../../components/nav-link'
import { NewOnboardingDialog } from '../../../../../components/new-onboarding-dialog'
import { pickTextFile } from '../../../../../lib/files'
import { useTRPC } from '../../../../../lib/trpc'

const projectRoute = getRouteApi('/_app/projects/$projectId')

export const Route = createFileRoute('/_app/projects/$projectId/onboardings/')({
  loader: ({ context, params }) => {
    const input = { projectId: params.projectId }
    return Promise.all([
      context.queryClient.ensureQueryData(context.trpc.onboardings.list.queryOptions(input)),
      context.queryClient.ensureQueryData(context.trpc.apps.groups.queryOptions(input)),
    ])
  },
  component: OnboardingsPage,
})

function OnboardingsPage() {
  const project = projectRoute.useLoaderData()
  const trpc = useTRPC()
  const input = { projectId: project.id }
  const { data: groups = [] } = useQuery(trpc.apps.groups.queryOptions(input))
  const { data: onboardings = [] } = useQuery(trpc.onboardings.list.queryOptions(input))
  const { data: publicUrl } = useQuery(trpc.onboardings.publicUrl.queryOptions(input))

  if (groups.length === 0) {
    return (
      <Page title="Onboardings">
        <Text>
          Onboardings belong to an app group. Add your apps from{' '}
          <AppLink to="/projects/$projectId/integrations" params={input}>
            Integrations
          </AppLink>{' '}
          first.
        </Text>
      </Page>
    )
  }

  return (
    <Page title="Onboardings">
      {groups.map((group) => (
        <GroupSection
          key={group.id}
          projectId={project.id}
          groupId={group.id}
          groupName={group.name}
          onboardings={onboardings.filter((o) => o.groupId === group.id)}
        />
      ))}
      <Section title="How apps read them">
        <Text>
          Apps ask for the latest published version of an onboarding, in one language, at{' '}
          <code>{publicUrl ?? '…/public/v1'}/onboardings/&lt;key&gt;?locale=&lt;locale&gt;</code> with a read-only{' '}
          <AppLink to="/projects/$projectId/settings" params={input}>
            API key
          </AppLink>{' '}
          in the Authorization header. Put the key in the app's proxy, never in the app.
        </Text>
      </Section>
    </Page>
  )
}

interface GroupSectionProps {
  projectId: string
  groupId: string
  groupName: string
  onboardings: Array<{
    id: string
    key: string
    name: string
    localeCount: number
    completeCount: number
    liveVersion: number | null
    lastPublishedAt: Date | null
  }>
}

function GroupSection({ projectId, groupId, groupName, onboardings }: GroupSectionProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: profile } = useQuery(trpc.onboardings.profile.queryOptions({ projectId, groupId }))
  const [creating, setCreating] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])

  const saveProfile = useMutation(
    trpc.onboardings.saveProfile.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.onboardings.pathFilter()),
    }),
  )
  const importJson = useMutation(
    trpc.onboardings.importJson.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries(trpc.onboardings.pathFilter())
        if (result.warnings.length > 0) setWarnings(result.warnings)
        else
          navigate({
            to: '/projects/$projectId/onboardings/$onboardingId',
            params: { projectId, onboardingId: result.onboardingId },
          })
      },
    }),
  )

  const pickProfile = async () => {
    const json = await pickTextFile()
    if (json) saveProfile.mutate({ projectId, groupId, json })
  }
  const pickOnboarding = async () => {
    const json = await pickTextFile()
    if (json) {
      setWarnings([])
      importJson.mutate({ projectId, groupId, json })
    }
  }

  const error = saveProfile.error?.message ?? importJson.error?.message

  return (
    <Section title={groupName}>
      <Stack>
        {onboardings.map((o) => (
          <NavLink
            key={o.id}
            to="/projects/$projectId/onboardings/$onboardingId"
            params={{ projectId, onboardingId: o.id }}
            trailing={
              <Inline>
                <Badge tone={o.completeCount < o.localeCount ? 'warning' : 'neutral'}>
                  {o.completeCount} of {o.localeCount} languages
                </Badge>
                {o.liveVersion ? (
                  <Badge tone="success">
                    Live v{o.liveVersion} · {o.lastPublishedAt?.toLocaleDateString()}
                  </Badge>
                ) : (
                  <Badge>Not published</Badge>
                )}
              </Inline>
            }
          >
            {o.name === o.key ? o.key : `${o.name} · ${o.key}`}
          </NavLink>
        ))}
        {onboardings.length === 0 && <Text>No onboardings yet.</Text>}
      </Stack>

      {profile !== undefined && <ProfileSummary profile={profile} />}

      <Inline>
        <Button variant="primary" onClick={() => setCreating(true)}>
          New onboarding
        </Button>
        <Button onClick={pickOnboarding} disabled={!profile || importJson.isPending}>
          {importJson.isPending ? 'Importing…' : 'Import JSON…'}
        </Button>
        <Button onClick={pickProfile} disabled={saveProfile.isPending}>
          {profile ? 'Replace app profile…' : 'Import app profile…'}
        </Button>
      </Inline>
      {error && <Callout tone="danger">{error}</Callout>}
      {warnings.length > 0 && (
        <Callout tone="warning" title="Imported, with notes">
          <List>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </List>
        </Callout>
      )}
      {creating && (
        <NewOnboardingDialog
          projectId={projectId}
          groupId={groupId}
          onClose={() => setCreating(false)}
          onCreated={(onboardingId) =>
            navigate({ to: '/projects/$projectId/onboardings/$onboardingId', params: { projectId, onboardingId } })
          }
        />
      )}
    </Section>
  )
}

function ProfileSummary({ profile }: { profile: AppProfile | null }) {
  if (!profile) {
    return (
      <Text>
        No app profile yet. Import the app's profile.json (Wallet: apps/mobile/src/features/onboarding/profile.json): it
        lists the buttons, fields, colours and media this app understands, and publishing checks against it.
      </Text>
    )
  }
  return (
    <Text>
      App profile <strong>{profile.app}</strong>: {profile.actions.length} actions ({profile.actions.join(', ')}),{' '}
      {profile.fields.length} fields, {profile.colors.length} colours, {profile.media.length} media slots, platforms{' '}
      {profile.platforms.join(', ')}.
    </Text>
  )
}
