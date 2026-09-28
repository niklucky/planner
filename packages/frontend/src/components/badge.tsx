import type { ComponentPropsWithRef } from 'react'
import { cx } from '../cx'
import styles from './badge.module.css'

export interface BadgeProps extends ComponentPropsWithRef<'span'> {
  tone?: 'neutral' | 'warning' | 'danger' | 'success'
}

/** Small inline status label, e.g. "machine" or "15 of 16". */
export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return <span className={cx(styles.badge, className)} data-tone={tone} {...rest} />
}
