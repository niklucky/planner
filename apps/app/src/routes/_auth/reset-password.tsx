import { AuthPage, Button, Field, Form, Input, Logo, Text } from '@planner/frontend'
import { resetPasswordInput } from '@planner/shared'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { z } from 'zod'
import { AppLink } from '../../components/nav-link'
import { type FieldErrors, parseForm } from '../../lib/form'
import { useTRPC } from '../../lib/trpc'

const searchSchema = z.object({ token: z.string().default('') })

export const Route = createFileRoute('/_auth/reset-password')({
  validateSearch: (search) => searchSchema.parse(search),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token } = Route.useSearch()
  const trpc = useTRPC()
  const [errors, setErrors] = useState<FieldErrors>({})
  const reset = useMutation(trpc.auth.resetPassword.mutationOptions())

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { data, errors } = parseForm(e, resetPasswordInput.pick({ password: true }))
    setErrors(errors)
    if (data) reset.mutate({ token, password: data.password })
  }

  const links = <AppLink to="/login">Back to sign in</AppLink>

  if (!token) {
    return (
      <AuthPage logo={<Logo>P</Logo>} title="Invalid link" links={links}>
        <Text>This reset link is missing its token. Request a new one.</Text>
      </AuthPage>
    )
  }

  return (
    <AuthPage logo={<Logo>P</Logo>} title="Set new password" links={links}>
      {reset.isSuccess ? (
        <Text>Password updated. You can sign in now.</Text>
      ) : (
        <Form onSubmit={onSubmit} error={reset.error?.message} noValidate>
          <Field label="New password" error={errors.password}>
            <Input name="password" type="password" autoComplete="new-password" autoFocus />
          </Field>
          <Button type="submit" variant="primary" size="lg" block disabled={reset.isPending}>
            Set password
          </Button>
        </Form>
      )}
    </AuthPage>
  )
}
