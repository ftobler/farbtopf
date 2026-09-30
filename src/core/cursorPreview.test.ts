import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BLACK, WHITE } from './color'
import { eraserFootprint, eraserPreviewRect, snapToDevicePixels } from './cursorPreview'
import { stamp } from './raster'

/** The bounding box of every pixel a square stamp actually changes. */
function stampedBounds(cx: number, cy: number, size: number, width = 40, height = 40) {
  const bitmap = new Bitmap(width, height, BLACK)
  stamp(bitmap, cx, cy, size, WHITE, 'square')
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (bitmap.get(x, y).r !== 255) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

describe('eraserFootprint', () => {
  it('is a single pixel at size 1', () => {
    expect(eraserFootprint({ x: 5, y: 7 }, 1, 40, 40)).toEqual({ x: 5, y: 7, width: 1, height: 1 })
  })

  it.each([1, 2, 3, 4, 5, 8, 12, 20, 32])('matches the pixels a size-%i eraser stamp changes', (size) => {
    expect(eraserFootprint({ x: 20, y: 18 }, size, 40, 40)).toEqual(stampedBounds(20, 18, size))
  })

  it('snaps a fractional pointer to the pixel under it', () => {
    expect(eraserFootprint({ x: 5.9, y: 7.2 }, 3, 40, 40)).toEqual({ x: 4, y: 6, width: 3, height: 3 })
  })

  it('is clipped to the image near its edges', () => {
    expect(eraserFootprint({ x: 0, y: 1 }, 8, 40, 40)).toEqual(stampedBounds(0, 1, 8))
    expect(eraserFootprint({ x: 39, y: 38 }, 8, 40, 40)).toEqual(stampedBounds(39, 38, 8))
  })
})

describe('snapToDevicePixels', () => {
  it('keeps whole CSS pixels at a ratio of 1', () => {
    expect(snapToDevicePixels(12.4, 1)).toBe(12)
    expect(snapToDevicePixels(12.6, 1)).toBe(13)
  })

  it('snaps to device pixels on high-density displays', () => {
    expect(snapToDevicePixels(12.4, 2)).toBe(12.5)
    expect(snapToDevicePixels(10, 1.5)).toBeCloseTo(10)
    expect(snapToDevicePixels(10.2, 1.5)).toBeCloseTo(10)
  })
})

describe('eraserPreviewRect', () => {
  it('scales the footprint by the zoom', () => {
    expect(eraserPreviewRect({ x: 10, y: 10 }, 4, 3, 1, 40, 40)).toEqual({ x: 27, y: 27, width: 12, height: 12 })
  })

  it('lines its edges up with the image pixel grid at fractional zoom', () => {
    // Footprint x = 9..11 at zoom 0.75 covers CSS 6.75..9: snapped to 7..9.
    expect(eraserPreviewRect({ x: 10, y: 10 }, 3, 0.75, 1, 40, 40)).toEqual({ x: 7, y: 7, width: 2, height: 2 })
  })

  it('never collapses below one device pixel', () => {
    const rect = eraserPreviewRect({ x: 10, y: 10 }, 1, 0.25, 1, 40, 40)
    expect(rect.width).toBeGreaterThanOrEqual(1)
    expect(rect.height).toBeGreaterThanOrEqual(1)
  })
})
