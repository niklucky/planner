import type { ReactNode } from 'react'
import styles from './layout.module.css'

/** Titled block of a page. */
export function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

export function Stack({ inset, children }: { inset?: boolean; children: ReactNode }) {
  return (
    <div className={styles.stack} data-inset={inset || undefined}>
      {children}
    </div>
  )
}

export function Inline({ children }: { children: ReactNode }) {
  return <div className={styles.inline}>{children}</div>
}

/** Primary text left, secondary text right. */
export function Row({ children, secondary }: { children: ReactNode; secondary?: ReactNode }) {
  return (
    <div className={styles.row}>
      <span>{children}</span>
      {secondary && <span className={styles.rowSecondary}>{secondary}</span>}
    </div>
  )
}

/** Narrow list on the left, detail on the right. `wide` lets the detail use the full width. */
export function Columns({ aside, wide, children }: { aside: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <div className={styles.columns}>
      <aside className={styles.columnsAside}>{aside}</aside>
      <div className={styles.columnsMain} data-wide={wide || undefined}>
        {children}
      </div>
    </div>
  )
}

/** Content with a fixed-width companion beside it (e.g. a preview) that wraps below on narrow screens. */
export function Split({ side, children }: { side: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.split}>
      <div className={styles.splitMain}>{children}</div>
      <div className={styles.splitSide}>{side}</div>
    </div>
  )
}
