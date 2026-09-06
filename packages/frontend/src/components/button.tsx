import type { ComponentPropsWithRef } from 'react'
import { cx } from '../cx'
import styles from './button.module.css'

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: 'ghost' | 'primary'
  /** `icon` renders a square button for a single icon; `lg` matches input height. */
  size?: 'md' | 'lg' | 'icon'
  /** Full width. */
  block?: boolean
}

export function Button({ variant = 'ghost', size = 'md', block, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], size !== 'md' && styles[size], block && styles.block, className)}
      {...rest}
    />
  )
}
