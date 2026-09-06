import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cx } from '../cx'
import styles from './tabs.module.css'

export function Tabs({ children }: { children: ReactNode }) {
  return <nav className={styles.tabs}>{children}</nav>
}

/** Anchor tab. Router-agnostic: wrap with `createLink` in the app. */
export function Tab({ className, ...rest }: ComponentPropsWithRef<'a'>) {
  return <a className={cx(styles.tab, className)} {...rest} />
}
