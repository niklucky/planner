import { type Db, schema } from '@planner/db'
import type { LoginInput, RegisterInput, User } from '@planner/shared'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { hashPassword, verifyPassword } from '../auth/password'
import { generateToken, hashToken } from '../auth/tokens'
import type { Mailer } from '../mail'

export type AuthErrorCode = 'EMAIL_TAKEN' | 'INVALID_CREDENTIALS' | 'INVALID_TOKEN'

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export interface AuthDeps {
  mailer: Mailer
  /** Public web app URL for links in emails. */
  appUrl: string
}

export interface Session {
  token: string
  expiresAt: Date
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const RESET_TTL_MS = 60 * 60 * 1000
const UNIQUE_VIOLATION = '23505'

function toUser(row: { id: string; email: string; name: string }): User {
  return { id: row.id, email: row.email, name: row.name }
}

export function authService(db: Db, deps: AuthDeps) {
  async function createSession(userId: string): Promise<Session> {
    const { token, hash } = generateToken()
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    await db.insert(schema.sessions).values({ userId, tokenHash: hash, expiresAt })
    return { token, expiresAt }
  }

  return {
    async register(input: RegisterInput) {
      const passwordHash = await hashPassword(input.password)
      try {
        const [row] = await db
          .insert(schema.users)
          .values({ email: input.email, name: input.name, passwordHash })
          .returning()
        const user = toUser(row!)
        return { user, session: await createSession(user.id) }
      } catch (e) {
        if (
          (e as { code?: string }).code === UNIQUE_VIOLATION ||
          (e as { cause?: { code?: string } }).cause?.code === UNIQUE_VIOLATION
        ) {
          throw new AuthError('EMAIL_TAKEN', 'Email is already registered')
        }
        throw e
      }
    },

    async login(input: LoginInput) {
      const row = await db.query.users.findFirst({ where: eq(schema.users.email, input.email) })
      const ok = row ? await verifyPassword(input.password, row.passwordHash) : false
      if (!row || !ok) throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password')
      return { user: toUser(row), session: await createSession(row.id) }
    },

    async logout(token: string) {
      await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)))
    },

    /** Resolves the user for a session token, or null when missing/expired. */
    async getUserBySession(token: string): Promise<User | null> {
      const tokenHash = hashToken(token)
      const [hit] = await db
        .select({ user: schema.users, expiresAt: schema.sessions.expiresAt })
        .from(schema.sessions)
        .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
        .where(eq(schema.sessions.tokenHash, tokenHash))
        .limit(1)
      if (!hit) return null
      if (hit.expiresAt <= new Date()) {
        await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash))
        return null
      }
      return toUser(hit.user)
    },

    /** Always resolves, so callers can't tell whether the email exists. */
    async requestPasswordReset(email: string) {
      const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) })
      if (!user) return
      const { token, hash } = generateToken()
      await db.insert(schema.passwordResetTokens).values({
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      })
      const url = `${deps.appUrl}/reset-password?token=${token}`
      await deps.mailer.send({
        to: user.email,
        subject: 'Reset your Planner password',
        text: `Hi ${user.name},\n\nUse this link to set a new password. It expires in one hour.\n\n${url}\n\nIf you didn't request this, ignore this email.`,
      })
    },

    /** Sets a new password and signs the user out everywhere. */
    async resetPassword(token: string, password: string) {
      const reset = await db.query.passwordResetTokens.findFirst({
        where: and(
          eq(schema.passwordResetTokens.tokenHash, hashToken(token)),
          isNull(schema.passwordResetTokens.usedAt),
          gt(schema.passwordResetTokens.expiresAt, new Date()),
        ),
      })
      if (!reset) throw new AuthError('INVALID_TOKEN', 'Reset link is invalid or has expired')
      const passwordHash = await hashPassword(password)
      const now = new Date()
      await db.transaction(async (tx) => {
        await tx.update(schema.users).set({ passwordHash, updatedAt: now }).where(eq(schema.users.id, reset.userId))
        await tx
          .update(schema.passwordResetTokens)
          .set({ usedAt: now })
          .where(eq(schema.passwordResetTokens.id, reset.id))
        await tx.delete(schema.sessions).where(eq(schema.sessions.userId, reset.userId))
      })
    },
  }
}
