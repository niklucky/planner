import type { CSSProperties } from 'react'
import styles from './avatar.module.css'

export interface AvatarProps {
  name: string
  shape?: 'square' | 'round'
  size?: number
}

export function Avatar({ name, shape = 'square', size = 20 }: AvatarProps) {
  return (
    <span
      className={styles.avatar}
      data-shape={shape}
      style={{ '--avatar-size': `${size}px` } as CSSProperties}
      aria-hidden
    >
      {name.trim().charAt(0)}
    </span>
  )
}
