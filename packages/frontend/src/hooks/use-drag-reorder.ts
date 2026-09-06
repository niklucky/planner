import { type DragEvent, type HTMLAttributes, useState } from 'react'

export type DragItemProps = HTMLAttributes<HTMLElement> & {
  draggable: boolean
  'data-dragging'?: boolean
  'data-over'?: boolean
}

/**
 * Native drag-and-drop reordering for a list. Spread `itemProps(index)` onto
 * each item; `onReorder(from, to)` fires when an item is dropped on another.
 */
export function useDragReorder(onReorder: (from: number, to: number) => void) {
  const [from, setFrom] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const reset = () => {
    setFrom(null)
    setOver(null)
  }

  const itemProps = (index: number): DragItemProps => ({
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      setFrom(index)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (over !== index) setOver(index)
    },
    onDragLeave: () => setOver((o) => (o === index ? null : o)),
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault()
      const source = from ?? Number(e.dataTransfer.getData('text/plain'))
      if (Number.isInteger(source) && source !== index) onReorder(source, index)
      reset()
    },
    onDragEnd: reset,
    'data-dragging': from === index || undefined,
    'data-over': (over === index && from !== null && from !== index) || undefined,
  })

  return { itemProps, dragging: from !== null }
}

/** Returns a copy of `items` with the element at `from` moved to `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved as T)
  return next
}
