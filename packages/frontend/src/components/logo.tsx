import type { ReactNode } from 'react'
import styles from './logo.module.css'

/** Small square mark, sized to match nav icons. */
export function Logo({ children }: { children: ReactNode }) {
  return (
    <span className={styles.logo} aria-hidden>
      {children}
    </span>
  )
}
