import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cx } from '../cx'
import styles from './table.module.css'

/**
 * A data grid that scrolls sideways inside the page, with the first column pinned.
 * Use plain <thead>/<tbody>/<tr>/<th>/<td> inside. Cells may hold inputs and textareas.
 */
export function Table({ className, children, ...rest }: ComponentPropsWithRef<'table'> & { children: ReactNode }) {
  return (
    <div className={styles.scroll}>
      <table className={cx(styles.table, className)} {...rest}>
        {children}
      </table>
    </div>
  )
}
