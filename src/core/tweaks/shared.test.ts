import { describe, expect, it } from 'vitest'
import type { Point } from '../geometry'
import { boxHandles, resizeBox } from './shared'

// Box from (10, 20) to (30, 40), given with the anchors in reverse order.
const BOX: readonly Point[] = [
  { x: 30, y: 40 },
  { x: 10, y: 20 },
]

describe('resizeBox', () => {
  it.each([
    ['nw', { x: 5, y: 15 }, [{ x: 5, y: 15 }, { x: 30, y: 40 }]],
    ['n', { x: 99, y: 15 }, [{ x: 10, y: 15 }, { x: 30, y: 40 }]],
    ['ne', { x: 35, y: 15 }, [{ x: 10, y: 15 }, { x: 35, y: 40 }]],
    ['e', { x: 35, y: 99 }, [{ x: 10, y: 20 }, { x: 35, y: 40 }]],
    ['se', { x: 35, y: 45 }, [{ x: 10, y: 20 }, { x: 35, y: 45 }]],
    ['s', { x: 99, y: 45 }, [{ x: 10, y: 20 }, { x: 30, y: 45 }]],
    ['sw', { x: 5, y: 45 }, [{ x: 5, y: 20 }, { x: 30, y: 45 }]],
    ['w', { x: 5, y: 99 }, [{ x: 5, y: 20 }, { x: 30, y: 40 }]],
  ] as const)('moves only the edges of the %s handle and keeps the opposite side fixed', (id, point, expected) => {
    expect(resizeBox(BOX, id, point)).toEqual(expected)
  })

  it.each([
    ['nw', { x: 50, y: 60 }, [{ x: 30, y: 40 }, { x: 50, y: 60 }]],
    ['n', { x: 0, y: 60 }, [{ x: 10, y: 40 }, { x: 30, y: 60 }]],
    ['ne', { x: 0, y: 60 }, [{ x: 0, y: 40 }, { x: 10, y: 60 }]],
    ['e', { x: 0, y: 0 }, [{ x: 0, y: 20 }, { x: 10, y: 40 }]],
    ['se', { x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 10, y: 20 }]],
    ['s', { x: 0, y: 0 }, [{ x: 10, y: 0 }, { x: 30, y: 20 }]],
    ['sw', { x: 50, y: 0 }, [{ x: 30, y: 0 }, { x: 50, y: 20 }]],
    ['w', { x: 50, y: 0 }, [{ x: 30, y: 20 }, { x: 50, y: 40 }]],
  ] as const)('normalises the box when the %s handle is dragged past the opposite edge', (id, point, expected) => {
    expect(resizeBox(BOX, id, point)).toEqual(expected)
  })

  it('places the dragged handle where the pointer is', () => {
    for (const handle of boxHandles(BOX)) {
      if (handle.id.length !== 2) continue
      const point = { x: handle.point.x + 3, y: handle.point.y - 4 }
      const resized = resizeBox(BOX, handle.id, point)
      if (!resized) throw new Error(`no box for ${handle.id}`)
      const moved = boxHandles(resized).find((h) => h.id === handle.id)
      expect(moved?.point).toEqual(point)
    }
  })

  it('rejects an unknown handle', () => {
    expect(resizeBox(BOX, 'radius', { x: 0, y: 0 })).toBeNull()
  })

  it('needs two anchors', () => {
    expect(resizeBox([{ x: 1, y: 1 }], 'se', { x: 5, y: 5 })).toBeNull()
  })
})
