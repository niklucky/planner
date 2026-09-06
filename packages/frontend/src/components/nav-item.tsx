import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cx } from '../cx'
import styles from './nav-item.module.css'

interface NavItemContentProps {
  icon?: ReactNode
  trailing?: ReactNode
  children?: ReactNode
}

function Content({ icon, trailing, children }: NavItemContentProps) {
  return (
    <>
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{children}</span>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
    </>
  )
}

export type NavItemProps = NavItemContentProps & ComponentPropsWithRef<'a'>

/** Anchor-based nav row. Router-agnostic: wrap with TanStack's `createLink` in the app. */
export function NavItem({ icon, trailing, children, className, ...rest }: NavItemProps) {
  return (
    <a className={cx(styles.item, className)} {...rest}>
      <Content icon={icon} trailing={trailing}>
        {children}
      </Content>
    </a>
  )
}

export type NavButtonProps = NavItemContentProps & ComponentPropsWithRef<'button'>

/** Same row, rendered as a button (menu triggers, actions). */
export function NavButton({ icon, trailing, children, className, type = 'button', ...rest }: NavButtonProps) {
  return (
    <button type={type} className={cx(styles.item, className)} {...rest}>
      <Content icon={icon} trailing={trailing}>
        {children}
      </Content>
    </button>
  )
}
