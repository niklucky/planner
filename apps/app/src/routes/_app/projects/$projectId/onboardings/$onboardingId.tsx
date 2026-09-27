import { Button, Inline, Page, Tab, Tabs, Text } from '@planner/frontend'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, notFound, useNavigate } from '@tanstack/react-router'
import { TRPCClientError } from '@trpc/client'
import { useState } from 'react'
import { z } from 'zod'
import { AppLink } from '../../../../../components/nav-link'
import { OnboardingCopyGrid } from '../../../../../components/onboarding-copy-grid'
import { OnboardingPages } from '../../../../../components/onboarding-pages'
import { OnboardingSettings } from '../../../../../components/onboarding-settings'
import { PublishOnboardingDialog } from '../../../../../components/publish-onboarding-dialog'
import { downloadJson, pickTextFile } from '../../../../../lib/files'
import { useTRPC } from '../../../../../lib/trpc'

const projectRoute = getRouteApi('/_app/projects/$projectId')

const TABS = [
  { id: 'pages', label: 'Pages' },
  { id: 'copy', label: 'Copy' },
  { id: 'settings', label: 'Settings' },
] as const
type TabId = (typeof TABS)[number]['id']

const searchSchema = z.object({
  tab: z.enum(['pages', 'copy', 'settings']).optional(),
  page: z.string().optional(),
})

export const Route = createFileRoute('/_app/projects/$projectId/onboardings/$onboardingId')({
  validateSearch: (search) => searchSchema.parse(search),
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(
        context.trpc.onboardings.get.queryOptions({ projectId: params.projectId, onboardingId: params.onboardingId }),
      )
    } catch (e) {
      if (e instanceof TRPCClientError && ['NOT_FOUND', 'BAD_REQUEST'].includes(e.data?.code)) throw notFound()
      throw e
    }
  },
  component: OnboardingEditor,
  notFoundComponent: () => <Page title="Onboarding not found" />,
})

function OnboardingEditor() {
  const project = projectRoute.useLoaderData()
  const { onboardingId } = Route.useParams()
  const search = Route.useSearch()
  const tab: TabId = search.tab ?? 'pages'
  const navigate = useNavigate({ from: Route.fullPath })
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const input = { projectId: project.id, onboardingId }
  const { data: detail } = useQuery(trpc.onboardings.get.queryOptions(input))
  const [publishing, setPublishing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const replace = useMutation(
    trpc.onboardings.importJson.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries(trpc.onboardings.pathFilter())
        setNotice(
          result.warnings.length > 0
            ? `Replaced the draft. Notes: ${result.warnings.join(' ')}`
            : 'Replaced the draft.',
        )
      },
    }),
  )

  if (!detail) return null
  const { draft, latestRelease } = detail

  const exportJson = async () => {
    const data = await queryClient.fetchQuery(trpc.onboardings.exportJson.queryOptions(input, { staleTime: 0 }))
    downloadJson(`${draft.key}.json`, data)
  }
  const importJson = async () => {
    const json = await pickTextFile()
    if (!json) return
    if (!confirm('Replace the whole draft with this file? Published releases stay as they are.')) return
    setNotice(null)
    replace.mutate({ projectId: project.id, groupId: draft.groupId, json })
  }

  return (
    <Page title={draft.name} wide>
      <Inline>
        <Text>
          <AppLink to="/projects/$projectId/onboardings" params={{ projectId: project.id }}>
            Onboardings
          </AppLink>{' '}
          · {draft.key} ·{' '}
          {latestRelease
            ? `Live: version ${latestRelease.version} (revision ${latestRelease.revision}), published ${latestRelease.publishedAt.toLocaleString()}, ${latestRelease.locales.length} languages`
            : 'Not published yet'}
        </Text>
      </Inline>
      <Inline>
        <Button variant="primary" onClick={() => setPublishing(true)}>
          Publish…
        </Button>
        <Button onClick={exportJson}>Export JSON</Button>
        <Button onClick={importJson} disabled={replace.isPending}>
          {replace.isPending ? 'Importing…' : 'Import JSON…'}
        </Button>
      </Inline>
      {(notice || replace.error) && <Text>{replace.error?.message ?? notice}</Text>}
      {!detail.profile && (
        <Text>
          This app group has no app profile yet: import it on the{' '}
          <AppLink to="/projects/$projectId/onboardings" params={{ projectId: project.id }}>
            Onboardings
          </AppLink>{' '}
          page to edit fields, colours and media.
        </Text>
      )}

      <Tabs>
        {TABS.map((t) => (
          <Tab
            key={t.id}
            href={`?tab=${t.id}`}
            data-status={tab === t.id ? 'active' : undefined}
            onClick={(e) => {
              e.preventDefault()
              navigate({ search: (s) => ({ ...s, tab: t.id }) })
            }}
          >
            {t.label}
          </Tab>
        ))}
      </Tabs>

      {tab === 'pages' && (
        <OnboardingPages
          projectId={project.id}
          detail={detail}
          selectedPageId={search.page}
          onSelect={(page) => navigate({ search: (s) => ({ ...s, page }) })}
        />
      )}
      {tab === 'copy' && <OnboardingCopyGrid key={draft.id} projectId={project.id} detail={detail} />}
      {tab === 'settings' && (
        <OnboardingSettings
          projectId={project.id}
          detail={detail}
          onDeleted={() => navigate({ to: '/projects/$projectId/onboardings', params: { projectId: project.id } })}
        />
      )}

      {publishing && (
        <PublishOnboardingDialog
          projectId={project.id}
          onboardingId={onboardingId}
          onClose={() => setPublishing(false)}
        />
      )}
    </Page>
  )
}
