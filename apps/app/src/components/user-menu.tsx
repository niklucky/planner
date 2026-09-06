import { Avatar, Menu, MenuItem, MenuSeparator, NavButton, useStoredState, useTheme } from '@planner/frontend'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTRPC } from '../lib/trpc'

const LANGUAGES = ['en', 'ru'] as const

export function UserMenu() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { theme, cycle } = useTheme()
  const [lang, setLang] = useStoredState<(typeof LANGUAGES)[number]>('planner.lang', 'en')

  // Loaded by the _app route guard, so this resolves from cache.
  const { data: user } = useQuery(trpc.auth.me.queryOptions())

  const logout = useMutation(
    trpc.auth.logout.mutationOptions({
      onSuccess: () => {
        queryClient.setQueryData(trpc.auth.me.queryKey(), null)
        navigate({ to: '/login' })
      },
    }),
  )

  const name = user?.name ?? ''

  return (
    <Menu
      placement="top-start"
      trigger={
        <NavButton icon={<Avatar name={name || '?'} shape="round" />} title={name}>
          {name}
        </NavButton>
      }
    >
      <MenuItem>Profile</MenuItem>
      <MenuItem
        value={lang.toUpperCase()}
        keepOpen
        onSelect={() => setLang(LANGUAGES[(LANGUAGES.indexOf(lang) + 1) % LANGUAGES.length]!)}
      >
        Language
      </MenuItem>
      <MenuItem value={theme} keepOpen onSelect={cycle}>
        Theme
      </MenuItem>
      <MenuSeparator />
      <MenuItem danger onSelect={() => logout.mutate()}>
        Sign out
      </MenuItem>
    </Menu>
  )
}
