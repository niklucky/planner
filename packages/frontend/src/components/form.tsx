import { type ComponentPropsWithRef, type ReactElement, type ReactNode, cloneElement } from 'react'
import { cx } from '../cx'
import styles from './form.module.css'

export type InputProps = ComponentPropsWithRef<'input'>

export function Input({ className, ...rest }: InputProps) {
  return <input className={cx(styles.input, className)} {...rest} />
}

export interface FieldProps {
  label: ReactNode
  error?: ReactNode
  /** A single input element; receives aria-invalid when `error` is set. */
  children: ReactElement<{ 'aria-invalid'?: boolean }>
}

/** Label wrapping the control, so no ids are needed. */
export function Field({ label, error, children }: FieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {cloneElement(children, { 'aria-invalid': error ? true : undefined })}
      {error && <span className={styles.fieldError}>{error}</span>}
    </label>
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
