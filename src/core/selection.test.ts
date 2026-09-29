import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BLACK, WHITE } from './color'
import {
  applyMask,
  fillSelection,
  invertSelection,
  isSelected,
  polygonSelection,
} from './selection'
import type { SelectionMask } from './selection'

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
