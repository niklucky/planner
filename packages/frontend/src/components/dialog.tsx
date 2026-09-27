import { type ReactNode, useEffect, useRef } from 'react'
import styles from './dialog.module.css'

export interface DialogProps {
  open: boolean
  title?: ReactNode
  /** When omitted the dialog can't be dismissed (no Escape, no backdrop click). */
  onClose?: () => void
  children: ReactNode
}

/** Modal built on the native <dialog>, which handles focus and the top layer. */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  return (
    // Backdrop click is a pointer-only affordance; keyboard users close with Escape (onCancel).
    // biome-ignore lint/a11y/useKeyWithClickEvents: see above
    <dialog
      ref={ref}
      className={styles.dialog}
      onCancel={(e) => {
        e.preventDefault()
        onClose?.()
      }}
      onClick={(e) => {
        if (onClose && e.target === e.currentTarget) onClose()
      }}
    >
      {title && <h2 className={styles.title}>{title}</h2>}
      {children}
    </dialog>
  )
}
