import type { ReactNode } from 'react'
import styles from './callout.module.css'

/** A boxed message: problems that block an action, warnings, or plain notes. */
export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger'
  title?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={styles.callout} data-tone={tone} role={tone === 'danger' ? 'alert' : undefined}>
      {title && <div className={styles.title}>{title}</div>}
      {children}
    </div>
  )
}

/** Bulleted list for inside a Callout (or anywhere a few parallel items need listing); `ordered` numbers steps. */
export function List({ ordered, children }: { ordered?: boolean; children: ReactNode }) {
  const Tag = ordered ? 'ol' : 'ul'
  return <Tag className={styles.list}>{children}</Tag>
}
