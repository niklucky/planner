import { z } from 'zod'

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email').max(255))

export const passwordSchema = z.string().min(8, 'At least 8 characters').max(128)

export const registerInput = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, 'Enter your name').max(120),
  password: passwordSchema,
})
export type RegisterInput = z.infer<typeof registerInput>

export const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
})
export type LoginInput = z.infer<typeof loginInput>

export const forgotPasswordInput = z.object({ email: emailSchema })
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInput>

export const resetPasswordInput = z.object({
  token: z.string().min(1),
  password: passwordSchema,
})
export type ResetPasswordInput = z.infer<typeof resetPasswordInput>

/** User shape exposed to clients. */
export interface User {
  id: string
  email: string
  name: string
}
