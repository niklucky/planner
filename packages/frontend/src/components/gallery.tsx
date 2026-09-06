import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../cx'
import styles from './gallery.module.css'

export function Gallery({ children }: { children: ReactNode }) {
  return <div className={styles.gallery}>{children}</div>
}

export interface ThumbnailProps extends HTMLAttributes<HTMLElement> {
  src: string
  alt: string
  onRemove?: () => void
}

/** Extra props (e.g. from `useDragReorder`) are spread onto the figure. */
export function Thumbnail({ src, alt, onRemove, className, ...rest }: ThumbnailProps) {
  return (
    <figure className={cx(styles.thumb, className)} style={{ margin: 0 }} {...rest}>
      <img src={src} alt={alt} loading="lazy" />
      {onRemove && (
        <button type="button" className={styles.remove} onClick={onRemove} aria-label={`Remove ${alt}`}>
          ×
        </button>
      )}
    </figure>
  )
}

export function GalleryEmpty({ children }: { children: ReactNode }) {
  return <div className={styles.empty}>{children}</div>
}
