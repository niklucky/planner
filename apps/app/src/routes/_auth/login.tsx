import { AuthPage, Button, Field, Form, Input, Logo } from '@planner/frontend'
import { loginInput } from '@planner/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { z } from 'zod'
import { AppLink } from '../../components/nav-link'
import { type FieldErrors, parseForm } from '../../lib/form'
import { useTRPC } from '../../lib/trpc'

const searchSchema = z.object({ redirect: z.string().optional() })

export const Route = createFileRoute('/_auth/login')({
  validateSearch: (search) => searchSchema.parse(search),
  component: LoginPage,
})

function LoginPage() {
  const { redirect } = Route.useSearch()
  const router = useRouter()
  const queryClient = useQueryClient()
  const trpc = useTRPC()
  const [errors, setErrors] = useState<FieldErrors>({})

  const login = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: (user) => {
        queryClient.setQueryData(trpc.auth.me.queryKey(), user)
        router.history.push(redirect ?? '/')
      },
    }),
  )

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { data, errors } = parseForm(e, loginInput)
    setErrors(errors)
    if (data) login.mutate(data)
  }

  return (
    <AuthPage
      logo={<Logo>P</Logo>}
      title="Sign in"
      links={
        <>
          <AppLink to="/forgot-password">Forgot password?</AppLink>
          <AppLink to="/register">Create account</AppLink>
        </>
      }
    >
      <Form onSubmit={onSubmit} error={login.error?.message} noValidate>
        <Field label="Email" error={errors.email}>
          <Input name="email" type="email" autoComplete="email" autoFocus />
        </Field>
        <Field label="Password" error={errors.password}>
          <Input name="password" type="password" autoComplete="current-password" />
        </Field>
        <Button type="submit" variant="primary" size="lg" block disabled={login.isPending}>
          Sign in
        </Button>
      </Form>
    </AuthPage>
  )
}
