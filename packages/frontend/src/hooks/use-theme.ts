import { useEffect } from 'react'
import { useStoredState } from './use-stored-state'

export type Theme = 'system' | 'light' | 'dark'
export const THEMES: readonly Theme[] = ['system', 'light', 'dark']
export const THEME_STORAGE_KEY = 'planner.theme'

export function useTheme() {
  const [theme, setTheme] = useStoredState<Theme>(THEME_STORAGE_KEY, 'system')

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
  }, [theme])

  const cycle = () => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!)

  return { theme, setTheme, cycle }
}
