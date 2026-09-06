import type { ReactNode } from 'react'
import styles from './layout.module.css'

/** Titled block of a page. */
export function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

export function Stack({ children }: { children: ReactNode }) {
  return <div className={styles.stack}>{children}</div>
}

export function Inline({ children }: { children: ReactNode }) {
  return <div className={styles.inline}>{children}</div>
}

/** Primary text left, secondary text right. */
export function Row({ children, secondary }: { children: ReactNode; secondary?: ReactNode }) {
  return (
    <div className={styles.row}>
      <span>{children}</span>
      {secondary && <span className={styles.rowSecondary}>{secondary}</span>}
    </div>
  )
}
