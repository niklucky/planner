import type { CSSProperties, ReactNode } from 'react'
import styles from './phone-preview.module.css'

export interface PhonePreviewProps {
  /** Top and bottom of the page wash. Falls back to the theme's surface. */
  background?: [string, string]
  ink?: string
  accent?: string
  kicker?: string
  title: string
  body: string
  /** Boxed aside above the buttons. */
  note?: string
  /** Illustration above the text. */
  media?: ReactNode
  primary?: string
  secondary?: string
  skip?: string
}

/** A phone-sized sketch of one onboarding page. Close to the app, not a replica of it. */
export function PhonePreview({
  background,
  ink,
  accent,
  kicker,
  title,
  body,
  note,
  media,
  primary,
  secondary,
  skip,
}: PhonePreviewProps) {
  const style = {
    '--preview-ink': ink,
    '--preview-accent': accent,
    background: background ? `linear-gradient(to bottom, ${background[0]}, ${background[1]})` : undefined,
  } as CSSProperties
  return (
    <div className={styles.phone} style={style}>
      <div className={styles.skip}>{skip}</div>
      {media && <div className={styles.media}>{media}</div>}
      {kicker && <div className={styles.kicker}>{kicker}</div>}
      <div className={styles.title}>{title || 'Title'}</div>
      <div className={styles.body}>{body || 'Body'}</div>
      <div className={styles.spacer} />
      {note && <div className={styles.note}>{note}</div>}
      {primary && <div className={styles.primary}>{primary}</div>}
      {secondary && <div className={styles.secondary}>{secondary}</div>}
    </div>
  )
}
