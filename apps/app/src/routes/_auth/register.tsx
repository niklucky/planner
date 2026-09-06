import { AuthPage, Button, Field, Form, Input, Logo } from '@planner/frontend'
import { registerInput } from '@planner/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { type FormEvent, useEffect, useState } from 'react'
import { z } from 'zod'
import { InviteHint, useInvitePreview } from '../../components/invite-hint'
import { AppLink } from '../../components/nav-link'
import { inviteTokenFromRedirect } from '../../lib/invite'
import { type FieldErrors, parseForm } from '../../lib/form'
import { useTRPC } from '../../lib/trpc'

const searchSchema = z.object({ redirect: z.string().optional() })

export const Route = createFileRoute('/_auth/register')({
  validateSearch: (search) => searchSchema.parse(search),
  component: RegisterPage,
})

function RegisterPage() {
  const { redirect } = Route.useSearch()
  const router = useRouter()
  const queryClient = useQueryClient()
  const trpc = useTRPC()
  const [errors, setErrors] = useState<FieldErrors>({})

  const invite = useInvitePreview(inviteTokenFromRedirect(redirect))
  const [email, setEmail] = useState('')
  // Prefill once the invitation loads; the user can still change it.
  useEffect(() => {
    if (invite.data) setEmail(invite.data.email)
  }, [invite.data])

  const register = useMutation(
    trpc.auth.register.mutationOptions({
      onSuccess: (user) => {
        queryClient.setQueryData(trpc.auth.me.queryKey(), user)
        router.history.push(redirect ?? '/')
      },
    }),
  )

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { data, errors } = parseForm(e, registerInput)
    setErrors(errors)
    if (data) register.mutate(data)
  }

  return (
    <AuthPage
      logo={<Logo>P</Logo>}
      title="Create account"
      links={<AppLink to="/login" search={{ redirect }}>Already have an account? Sign in</AppLink>}
    >
      <Form onSubmit={onSubmit} error={register.error?.message} noValidate>
        <Field label="Name" error={errors.name}>
          <Input name="name" autoComplete="name" autoFocus />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <InviteHint preview={invite.data} email={email} />
        <Field label="Password" error={errors.password}>
          <Input name="password" type="password" autoComplete="new-password" />
        </Field>
        <Button type="submit" variant="primary" size="lg" block disabled={register.isPending}>
          Create account
        </Button>
      </Form>
    </AuthPage>
  )
}
