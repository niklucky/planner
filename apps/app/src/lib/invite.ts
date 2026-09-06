/** Extracts the invitation token when a return path points at the invite page. */
export function inviteTokenFromRedirect(redirect: string | undefined) {
  if (!redirect) return undefined
  try {
    const url = new URL(redirect, 'http://local')
    return url.pathname === '/invite' ? (url.searchParams.get('token') ?? undefined) : undefined
  } catch {
    return undefined
  }
}
