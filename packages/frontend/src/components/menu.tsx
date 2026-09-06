import {
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import styles from './menu.module.css'

export type MenuPlacement = 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'

const MenuContext = createContext<{ close: () => void } | null>(null)

interface TriggerProps {
  onClick?: (e: MouseEvent<HTMLElement>) => void
  'aria-haspopup'?: 'menu'
  'aria-expanded'?: boolean
  'aria-controls'?: string
}

export interface MenuProps {
  /** Element that toggles the menu. Receives onClick and aria attributes. */
  trigger: ReactElement<TriggerProps>
  placement?: MenuPlacement
  children: ReactNode
}

export function Menu({ trigger, placement = 'bottom-start', children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = useCallback(() => {
    setOpen(false)
    rootRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const items = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close()
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const list = items()
      if (list.length === 0) return
      e.preventDefault()
      const i = list.indexOf(document.activeElement as HTMLElement)
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length
      list[next]?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    items()[0]?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  return (
    <div ref={rootRef} className={styles.root}>
      {cloneElement(trigger, {
        onClick: (e: MouseEvent<HTMLElement>) => {
          trigger.props.onClick?.(e)
          setOpen((o) => !o)
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
      })}
      {open && (
        <MenuContext.Provider value={{ close }}>
          <div ref={listRef} id={id} role="menu" className={styles.menu} data-placement={placement}>
            {children}
          </div>
        </MenuContext.Provider>
      )}
    </div>
  )
}

export interface MenuItemProps {
  children: ReactNode
  /** Secondary text on the right (current value). */
  value?: ReactNode
  danger?: boolean
  onSelect?: () => void
  /** Keep the menu open after selecting (for toggles). */
  keepOpen?: boolean
}

export function MenuItem({ children, value, danger, onSelect, keepOpen }: MenuItemProps) {
  const ctx = useContext(MenuContext)
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.item}
      data-danger={danger || undefined}
      onClick={() => {
        onSelect?.()
        if (!keepOpen) ctx?.close()
      }}
    >
      <span className={styles.label}>{children}</span>
      {value != null && <span className={styles.value}>{value}</span>}
    </button>
  )
}

export function MenuSeparator() {
  return <div role="separator" className={styles.separator} />
}
