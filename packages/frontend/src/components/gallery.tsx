import type { ReactNode } from 'react'
import styles from './gallery.module.css'

export function Gallery({ children }: { children: ReactNode }) {
  return <div className={styles.gallery}>{children}</div>
}

export interface ThumbnailProps {
  src: string
  alt: string
  onRemove?: () => void
}

export function Thumbnail({ src, alt, onRemove }: ThumbnailProps) {
  return (
    <figure className={styles.thumb} style={{ margin: 0 }}>
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
