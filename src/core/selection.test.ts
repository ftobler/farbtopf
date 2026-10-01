import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BLACK, WHITE } from './color'
import type { Point, Rect } from './geometry'
import {
  applyMask,
  fillSelection,
  invertSelectedColors,
  invertSelection,
  isSelected,
  polygonSelection,
} from './selection'
import type { Selection, SelectionMask } from './selection'

function maskFrom(rows: string[]): SelectionMask {
  const width = rows[0].length
  const height = rows.length
  const data = new Uint8Array(width * height)
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) data[y * width + x] = row[x] === '#' ? 1 : 0
  })
  return { width, height, data }
}

function maskRows(mask: SelectionMask): string[] {
  const rows: string[] = []
  for (let y = 0; y < mask.height; y += 1) {
    let row = ''
    for (let x = 0; x < mask.width; x += 1) row += mask.data[y * mask.width + x] ? '#' : '.'
    rows.push(row)
  }
  return rows
}

function referencePointInPolygon(x: number, y: number, points: readonly Point[]): boolean {
  let crossings = 0
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]
    const b = points[j]
    if (a.y > y !== b.y > y) {
      const crossingX = ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
      if (x < crossingX) crossings += 1
    }
  }
  return crossings % 2 === 1
}

function referenceSelection(points: readonly Point[], width: number, height: number): Selection | null {
  const flags = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (referencePointInPolygon(x + 0.5, y + 0.5, points)) flags[y * width + x] = 1
    }
  }
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!flags[y * width + x]) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) return null
  const rect: Rect = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
  const data = new Uint8Array(rect.width * rect.height)
  let full = true
  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      const value = flags[(rect.y + y) * width + rect.x + x]
      data[y * rect.width + x] = value
      if (!value) full = false
    }
  }
  return { rect, mask: full ? null : { width: rect.width, height: rect.height, data } }
}

function circlePoints(count: number, cx: number, cy: number, r: number): Point[] {
  const points: Point[] = []
  for (let i = 0; i < count; i += 1) {
    const angle = (2 * Math.PI * i) / count
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  }
  return points
}

describe('polygonSelection', () => {
  it('returns null for fewer than three points', () => {
    expect(polygonSelection([{ x: 0, y: 0 }, { x: 5, y: 5 }], 10, 10)).toBeNull()
  })

  it('selects the pixels inside a triangle with a tight bounding rect', () => {
    const result = polygonSelection(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
      ],
      10,
      10,
    )
    expect(result?.rect).toEqual({ x: 0, y: 0, width: 3, height: 3 })
    expect(maskRows(result!.mask!)).toEqual(['###', '##.', '#..'])
  })

  it('clips the polygon to the canvas', () => {
    const result = polygonSelection(
      [
        { x: -5, y: -5 },
        { x: 3, y: -5 },
        { x: 3, y: 3 },
        { x: -5, y: 3 },
      ],
      10,
      10,
    )
    expect(result?.rect).toEqual({ x: 0, y: 0, width: 3, height: 3 })
    expect(result?.mask).toBeNull()
  })

  it('returns null when the polygon covers no pixel centre', () => {
    expect(
      polygonSelection(
        [
          { x: 0, y: 0 },
          { x: 0.2, y: 0 },
          { x: 0, y: 0.2 },
        ],
        10,
        10,
      ),
    ).toBeNull()
  })

  it('matches a brute-force rasterisation for assorted polygons', () => {
    const cases: Point[][] = [
      [
        { x: 1, y: 1 },
        { x: 6, y: 1 },
        { x: 6, y: 3 },
        { x: 3, y: 3 },
        { x: 3, y: 6 },
        { x: 1, y: 6 },
      ],
      [
        { x: -4, y: 2 },
        { x: 5, y: 2 },
        { x: 5, y: 7 },
        { x: 4, y: 7 },
        { x: 4, y: 4 },
        { x: -4, y: 4 },
      ],
      [
        { x: -5, y: -5 },
        { x: 15, y: -5 },
        { x: 15, y: 15 },
        { x: -5, y: 15 },
      ],
      [
        { x: 1, y: 1 },
        { x: 8, y: 8 },
        { x: 1, y: 8 },
        { x: 8, y: 1 },
      ],
      [
        { x: 20, y: 20 },
        { x: 25, y: 20 },
        { x: 20, y: 25 },
      ],
      [
        { x: 0, y: 0 },
        { x: 9.5, y: 0 },
        { x: 9.5, y: 9.5 },
        { x: 0, y: 9.5 },
      ],
      circlePoints(24, 5, 5, 4),
    ]
    for (const points of cases) {
      expect(polygonSelection(points, 10, 10)).toEqual(referenceSelection(points, 10, 10))
    }
  })

  it('matches a brute-force rasterisation on a non-square canvas', () => {
    const points: Point[] = [
      { x: 2, y: -1 },
      { x: 11, y: 3 },
      { x: 7, y: 12 },
      { x: -2, y: 6 },
    ]
    expect(polygonSelection(points, 9, 14)).toEqual(referenceSelection(points, 9, 14))
  })

  it('returns the tight rect for a small polygon on a large canvas', () => {
    const size = 2048
    const result = polygonSelection(
      [
        { x: 1000, y: 1500 },
        { x: 1003, y: 1500 },
        { x: 1000, y: 1503 },
      ],
      size,
      size,
    )
    expect(result?.rect).toEqual({ x: 1000, y: 1500, width: 2, height: 2 })
    expect(maskRows(result!.mask!)).toEqual(['##', '#.'])
  })

  it('rasterises a large canvas with a detailed lasso within a generous budget', () => {
    const size = 2048
    const points = circlePoints(500, 1024, 1024, 600)
    const start = performance.now()
    const result = polygonSelection(points, size, size)
    const elapsed = performance.now() - start
    expect(result?.rect.x).toBe(424)
    expect(result?.rect.width).toBe(1200)
    expect(elapsed).toBeLessThan(2000)
  })
})

describe('isSelected', () => {
  it('treats a missing mask as the full rectangle', () => {
    expect(isSelected({ x: 2, y: 2, width: 2, height: 2 }, null, 3, 3)).toBe(true)
    expect(isSelected({ x: 2, y: 2, width: 2, height: 2 }, null, 4, 3)).toBe(false)
  })

  it('consults the mask relative to the rect', () => {
    const mask = maskFrom(['#.', '.#'])
    const rect = { x: 5, y: 5, width: 2, height: 2 }
    expect(isSelected(rect, mask, 5, 5)).toBe(true)
    expect(isSelected(rect, mask, 6, 5)).toBe(false)
    expect(isSelected(rect, mask, 6, 6)).toBe(true)
  })
})

describe('invertSelection', () => {
  it('selects the whole canvas when nothing is selected', () => {
    expect(invertSelection(null, null, 4, 3)).toEqual({
      rect: { x: 0, y: 0, width: 4, height: 3 },
      mask: null,
    })
  })

  it('selects nothing when everything is selected', () => {
    expect(invertSelection({ x: 0, y: 0, width: 4, height: 3 }, null, 4, 3)).toBeNull()
  })

  it('inverts a rectangle into a mask with tight bounds', () => {
    const result = invertSelection({ x: 0, y: 0, width: 2, height: 3 }, null, 4, 3)
    expect(result?.rect).toEqual({ x: 2, y: 0, width: 2, height: 3 })
    expect(result?.mask).toBeNull()
  })

  it('inverts a hole in the middle', () => {
    const result = invertSelection({ x: 1, y: 1, width: 1, height: 1 }, null, 3, 3)
    expect(result?.rect).toEqual({ x: 0, y: 0, width: 3, height: 3 })
    expect(maskRows(result!.mask!)).toEqual(['###', '#.#', '###'])
  })
})

describe('applyMask', () => {
  it('makes unselected pixels transparent', () => {
    const bitmap = new Bitmap(2, 1, BLACK)
    const result = applyMask(bitmap, maskFrom(['#.']))
    expect(result.get(0, 0)).toEqual(BLACK)
    expect(result.get(1, 0).a).toBe(0)
  })
})

describe('fillSelection', () => {
  it('fills only the selected pixels', () => {
    const bitmap = new Bitmap(3, 1, BLACK)
    fillSelection(bitmap, { x: 1, y: 0, width: 2, height: 1 }, maskFrom(['.#']), WHITE)
    expect(bitmap.get(0, 0)).toEqual(BLACK)
    expect(bitmap.get(1, 0)).toEqual(BLACK)
    expect(bitmap.get(2, 0)).toEqual(WHITE)
  })
})

describe('invertSelectedColors', () => {
  it('inverts only the selected pixels, keeping alpha', () => {
    const bitmap = new Bitmap(3, 1, { r: 10, g: 20, b: 30, a: 40 })
    invertSelectedColors(bitmap, { x: 1, y: 0, width: 2, height: 1 }, maskFrom(['.#']))
    expect(bitmap.get(0, 0)).toEqual({ r: 10, g: 20, b: 30, a: 40 })
    expect(bitmap.get(1, 0)).toEqual({ r: 10, g: 20, b: 30, a: 40 })
    expect(bitmap.get(2, 0)).toEqual({ r: 245, g: 235, b: 225, a: 40 })
  })

  it('ignores the part of the selection outside the bitmap', () => {
    const bitmap = new Bitmap(2, 2, BLACK)
    invertSelectedColors(bitmap, { x: -1, y: -1, width: 2, height: 2 }, null)
    expect(bitmap.get(0, 0)).toEqual(WHITE)
    expect(bitmap.get(1, 1)).toEqual(BLACK)
  })
})
