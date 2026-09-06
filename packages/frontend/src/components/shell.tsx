import type { ReactNode } from 'react'
import styles from './shell.module.css'

export function AppShell({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>{children}</div>
}

export function Sidebar({ collapsed, children }: { collapsed?: boolean; children: ReactNode }) {
  return (
    <aside className={styles.sidebar} data-collapsed={collapsed || undefined}>
      {children}
    </aside>
  )
}

export function SidebarSection({ scroll, children }: { scroll?: boolean; children: ReactNode }) {
  return (
    <div className={styles.section} data-scroll={scroll || undefined}>
      {children}
    </div>
  )
}

export function SubNav({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <nav className={styles.subnav}>
      {title && <div className={styles.subnavHeader}>{title}</div>}
      {children}
    </nav>
  )
}

export function Main({ children }: { children: ReactNode }) {
  return <main className={styles.main}>{children}</main>
}

export function Page({ title, wide, children }: { title: ReactNode; wide?: boolean; children?: ReactNode }) {
  return (
    <div className={styles.page} data-wide={wide || undefined}>
      <h1 className={styles.pageTitle}>{title}</h1>
      {children}
    </div>
  )
}

/** Brand row: logo, title, and trailing controls (e.g. collapse toggle). Stacks when collapsed. */
export function SidebarHeader({ logo, title, children }: { logo: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className={styles.header}>
      <span className={styles.headerLogo}>{logo}</span>
      <span className={styles.headerTitle}>{title}</span>
      {children}
    </div>
  )
}
