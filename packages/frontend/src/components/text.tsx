import type { ComponentPropsWithRef } from 'react'
import { cx } from '../cx'
import styles from './text.module.css'

export function Text({ className, ...rest }: ComponentPropsWithRef<'p'>) {
  return <p className={cx(styles.muted, className)} {...rest} />
}

/** Inline text link. Router-agnostic: wrap with `createLink` in the app. */
export function TextLink({ className, ...rest }: ComponentPropsWithRef<'a'>) {
  return <a className={cx(styles.link, className)} {...rest} />
}
