import type { ReactNode } from 'react'
import styles from './auth-page.module.css'

export interface AuthPageProps {
  logo?: ReactNode
  title: ReactNode
  children: ReactNode
  /** Row of secondary links under the form. */
  links?: ReactNode
}

/** Centered single-column page for sign in / sign up flows. */
export function AuthPage({ logo, title, children, links }: AuthPageProps) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {logo}
        <h1 className={styles.title}>{title}</h1>
        {children}
        {links && <div className={styles.links}>{links}</div>}
      </div>
    </div>
  )
}
