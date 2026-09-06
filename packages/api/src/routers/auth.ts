import { AuthError, type AuthErrorCode } from '@planner/server'
import { forgotPasswordInput, loginInput, registerInput, resetPasswordInput } from '@planner/shared'
import { TRPCError } from '@trpc/server'
import { publicProcedure, router } from '../trpc'

const codes: Record<AuthErrorCode, TRPCError['code']> = {
  EMAIL_TAKEN: 'CONFLICT',
  INVALID_CREDENTIALS: 'UNAUTHORIZED',
  INVALID_TOKEN: 'BAD_REQUEST',
}

function rethrow(e: unknown): never {
  if (e instanceof AuthError) throw new TRPCError({ code: codes[e.code], message: e.message, cause: e })
  throw e
}

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    const token = ctx.session.get()
    return token ? ctx.services.auth.getUserBySession(token) : null
  }),

  register: publicProcedure.input(registerInput).mutation(async ({ ctx, input }) => {
    const { user, session } = await ctx.services.auth.register(input).catch(rethrow)
    ctx.session.set(session.token, session.expiresAt)
    return user
  }),

  login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
    const { user, session } = await ctx.services.auth.login(input).catch(rethrow)
    ctx.session.set(session.token, session.expiresAt)
    return user
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const token = ctx.session.get()
    if (token) await ctx.services.auth.logout(token)
    ctx.session.clear()
    return { ok: true as const }
  }),

  forgotPassword: publicProcedure.input(forgotPasswordInput).mutation(async ({ ctx, input }) => {
    await ctx.services.auth.requestPasswordReset(input.email)
    return { ok: true as const }
  }),

  resetPassword: publicProcedure.input(resetPasswordInput).mutation(async ({ ctx, input }) => {
    await ctx.services.auth.resetPassword(input.token, input.password).catch(rethrow)
    return { ok: true as const }
  }),
})
