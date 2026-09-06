import { Columns, Stack, Text } from '@planner/frontend'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { z } from 'zod'
import { NavLink } from '../../../../../components/nav-link'
import { ReleaseNotesEditor } from '../../../../../components/release-notes-editor'
import { useTRPC } from '../../../../../lib/trpc'

const projectRoute = getRouteApi('/_app/projects/$projectId')
const searchSchema = z.object({ release: z.string().optional() })

export const Route = createFileRoute('/_app/projects/$projectId/stores/releases')({
  validateSearch: (search) => searchSchema.parse(search),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(context.trpc.releases.list.queryOptions({ projectId: params.projectId })),
  component: ReleasesTab,
})

function ReleasesTab() {
  const project = projectRoute.useLoaderData()
  const { release: selectedId } = Route.useSearch()
  const trpc = useTRPC()
  const { data: releases = [] } = useQuery(trpc.releases.list.queryOptions({ projectId: project.id }))

  const selected = releases.find((r) => r.id === selectedId) ?? releases[0]

  if (releases.length === 0) {
    return <Text>No releases yet. Sync an app's versions from the Overview to see them here.</Text>
  }

  const groupIds = Array.from(new Set(releases.map((r) => r.groupId)))

  return (
    <Columns
      aside={groupIds.map((groupId) => {
        const items = releases.filter((r) => r.groupId === groupId)
        return (
          <Stack key={groupId}>
            {groupIds.length > 1 && <Text>{items[0]!.groupName}</Text>}
            {items.map((r) => (
              <NavLink
                key={r.id}
                to="/projects/$projectId/stores/releases"
                params={{ projectId: project.id }}
                search={{ release: r.id }}
                data-status={r.id === selected?.id ? 'active' : undefined}
                trailing={r.versions.map((v) => (v.platform === 'ios' ? 'iOS' : 'Android')).join(' · ')}
              >
                {r.version}
              </NavLink>
            ))}
          </Stack>
        )
      })}
    >
      {selected && <ReleaseNotesEditor key={selected.id} projectId={project.id} releaseId={selected.id} />}
    </Columns>
  )
}
