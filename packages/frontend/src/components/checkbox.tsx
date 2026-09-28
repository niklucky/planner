import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cx } from '../cx'
import styles from './checkbox.module.css'

export interface CheckboxProps extends Omit<ComponentPropsWithRef<'input'>, 'type'> {
  label: ReactNode
}

export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx(styles.checkbox, className)}>
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  )
}
