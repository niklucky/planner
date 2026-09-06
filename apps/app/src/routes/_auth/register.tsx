import { AuthPage, Button, Field, Form, Input, Logo } from '@planner/frontend'
import { registerInput } from '@planner/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { AppLink } from '../../components/nav-link'
import { type FieldErrors, parseForm } from '../../lib/form'
import { useTRPC } from '../../lib/trpc'

export const Route = createFileRoute('/_auth/register')({
  component: RegisterPage,
})

function RegisterPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const trpc = useTRPC()
  const [errors, setErrors] = useState<FieldErrors>({})

  const register = useMutation(
    trpc.auth.register.mutationOptions({
      onSuccess: (user) => {
        queryClient.setQueryData(trpc.auth.me.queryKey(), user)
        navigate({ to: '/' })
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
      links={<AppLink to="/login">Already have an account? Sign in</AppLink>}
    >
      <Form onSubmit={onSubmit} error={register.error?.message} noValidate>
        <Field label="Name" error={errors.name}>
          <Input name="name" autoComplete="name" autoFocus />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input name="email" type="email" autoComplete="email" />
        </Field>
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
