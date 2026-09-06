import { describe, expect, it } from 'vitest'
import { moveItem } from './use-drag-reorder'

describe('moveItem', () => {
  it('moves forward and backward without mutating', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(items, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(items).toEqual(['a', 'b', 'c', 'd'])
  })
})
