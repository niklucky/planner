import { AuthPage, Button, Field, Form, Input, Logo, Text } from '@planner/frontend'
import { forgotPasswordInput } from '@planner/shared'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { AppLink } from '../../components/nav-link'
import { type FieldErrors, parseForm } from '../../lib/form'
import { useTRPC } from '../../lib/trpc'

export const Route = createFileRoute('/_auth/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const trpc = useTRPC()
  const [errors, setErrors] = useState<FieldErrors>({})
  const forgot = useMutation(trpc.auth.forgotPassword.mutationOptions())

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { data, errors } = parseForm(e, forgotPasswordInput)
    setErrors(errors)
    if (data) forgot.mutate(data)
  }

  return (
    <AuthPage logo={<Logo>P</Logo>} title="Reset password" links={<AppLink to="/login">Back to sign in</AppLink>}>
      {forgot.isSuccess ? (
        <Text>If an account exists for that email, a reset link is on its way.</Text>
      ) : (
        <Form onSubmit={onSubmit} error={forgot.error?.message} noValidate>
          <Field label="Email" error={errors.email}>
            <Input name="email" type="email" autoComplete="email" autoFocus />
          </Field>
          <Button type="submit" variant="primary" size="lg" block disabled={forgot.isPending}>
            Send reset link
          </Button>
        </Form>
      )}
    </AuthPage>
  )
}
