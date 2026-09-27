import { type ComponentPropsWithRef, cloneElement, type ReactElement, type ReactNode, useId } from 'react'
import { cx } from '../cx'
import styles from './form.module.css'

export type InputProps = ComponentPropsWithRef<'input'>

export function Input({ className, ...rest }: InputProps) {
  return <input className={cx(styles.input, className)} {...rest} />
}

export interface FieldProps {
  label: ReactNode
  error?: ReactNode
  /** Optional control shown at the right of the label (e.g. a small action). */
  action?: ReactNode
  /** A single input element; receives id and aria-invalid. */
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean }>
}

export function Field({ label, error, action, children }: FieldProps) {
  const id = useId()
  return (
    <div className={styles.field}>
      <div className={styles.fieldHeader}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {action}
      </div>
      {cloneElement(children, { id, 'aria-invalid': error ? true : undefined })}
      {error && <span className={styles.fieldError}>{error}</span>}
    </div>
  )
}

export interface FormProps extends ComponentPropsWithRef<'form'> {
  /** Form-level error shown above the fields. */
  error?: ReactNode
}

export function Form({ error, className, children, ...rest }: FormProps) {
  return (
    <form className={cx(styles.form, className)} {...rest}>
      {error && (
        <p role="alert" className={styles.formError}>
          {error}
        </p>
      )}
      {children}
    </form>
  )
}

export type TextareaProps = ComponentPropsWithRef<'textarea'>

export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea className={cx(styles.input, styles.textarea, className)} {...rest} />
}

export type SelectProps = ComponentPropsWithRef<'select'>

export function Select({ className, ...rest }: SelectProps) {
  return <select className={cx(styles.input, styles.select, className)} {...rest} />
}
