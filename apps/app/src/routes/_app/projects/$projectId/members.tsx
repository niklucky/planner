import { Button, Field, Form, Inline, Input, Page, Row, Section, Stack, Text } from '@planner/frontend'
import { inviteMemberInput } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { type FieldErrors, parseForm } from '../../../../lib/form'
import { useTRPC } from '../../../../lib/trpc'

const projectRoute = getRouteApi('/_app/projects/$projectId')

export const Route = createFileRoute('/_app/projects/$projectId/members')({
  loader: ({ context, params }) => {
    const input = { projectId: params.projectId }
    return Promise.all([
      context.queryClient.ensureQueryData(context.trpc.projects.members.queryOptions(input)),
      context.queryClient.ensureQueryData(context.trpc.projects.invitations.queryOptions(input)),
    ])
  },
  component: MembersPage,
})

function MembersPage() {
  const project = projectRoute.useLoaderData()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const input = { projectId: project.id }
  const isOwner = project.role === 'owner'

  const { data: members = [] } = useQuery(trpc.projects.members.queryOptions(input))
  const { data: invitations = [] } = useQuery(trpc.projects.invitations.queryOptions(input))
  const { data: me } = useQuery(trpc.auth.me.queryOptions())

  const invalidate = () => queryClient.invalidateQueries(trpc.projects.pathFilter())
  const invite = useMutation(trpc.projects.invite.mutationOptions({ onSuccess: invalidate }))
  const revoke = useMutation(trpc.projects.revokeInvitation.mutationOptions({ onSuccess: invalidate }))
  const remove = useMutation(trpc.projects.removeMember.mutationOptions({ onSuccess: invalidate }))
  const [errors, setErrors] = useState<FieldErrors>({})

  const onInvite = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const { data, errors } = parseForm(e, inviteMemberInput)
    setErrors(errors)
    if (data) invite.mutate({ ...input, ...data }, { onSuccess: () => form.reset() })
  }

  return (
    <Page title="Members">
      <Section title={`Members · ${members.length}`}>
        <Stack>
          {members.map((m) => (
            <Row
              key={m.userId}
              secondary={
                <Inline>
                  <span>{m.role === 'owner' ? 'Owner' : 'Member'}</span>
                  {isOwner && m.role !== 'owner' && (
                    <Button onClick={() => remove.mutate({ ...input, userId: m.userId })} disabled={remove.isPending}>
                      Remove
                    </Button>
                  )}
                </Inline>
              }
            >
              {m.name}
              {m.userId === me?.id ? ' (you)' : ''} · {m.email}
            </Row>
          ))}
        </Stack>
        {remove.error && <Text>{remove.error.message}</Text>}
      </Section>

      {isOwner && (
        <Section title="Invite">
          <Form onSubmit={onInvite} error={invite.error?.message} noValidate>
            <Field label="Email" error={errors.email}>
              <Input name="email" type="email" autoComplete="off" placeholder="teammate@example.com" />
            </Field>
            <Inline>
              <Button type="submit" variant="primary" disabled={invite.isPending}>
                {invite.isPending ? 'Sending…' : 'Send invitation'}
              </Button>
            </Inline>
          </Form>
          {invite.isSuccess && <Text>Invitation sent.</Text>}

          {invitations.length > 0 && (
            <Stack>
              <Text>Pending</Text>
              {invitations.map((inv) => (
                <Row
                  key={inv.id}
                  secondary={
                    <Inline>
                      <span>Expires {inv.expiresAt.toLocaleDateString()}</span>
                      <Button
                        onClick={() => revoke.mutate({ ...input, invitationId: inv.id })}
                        disabled={revoke.isPending}
                      >
                        Revoke
                      </Button>
                    </Inline>
                  }
                >
                  {inv.email}
                </Row>
              ))}
            </Stack>
          )}
        </Section>
      )}
    </Page>
  )
}
