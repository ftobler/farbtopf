import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BLACK, WHITE, rgba } from './color'

describe('Bitmap', () => {
  it('starts transparent', () => {
    const bitmap = new Bitmap(2, 3)
    expect(bitmap.get(0, 0)).toEqual(rgba(0, 0, 0, 0))
  })

  it('fills with a color', () => {
    const bitmap = new Bitmap(2, 2, WHITE)
    expect(bitmap.get(1, 1)).toEqual(WHITE)
  })

  it('reports bounds', () => {
    const bitmap = new Bitmap(3, 4)
    expect(bitmap.contains(2, 3)).toBe(true)
    expect(bitmap.contains(3, 3)).toBe(false)
    expect(bitmap.contains(-1, 0)).toBe(false)
  })

  it('ignores writes out of bounds', () => {
    const bitmap = new Bitmap(2, 2)
    bitmap.set(-1, 0, BLACK)
    bitmap.set(0, 5, BLACK)
    expect(bitmap.get(-1, 0)).toEqual(rgba(0, 0, 0, 0))
  })

  it('clones independently', () => {
    const bitmap = new Bitmap(2, 2, WHITE)
    const copy = bitmap.clone()
    copy.set(0, 0, BLACK)
    expect(bitmap.get(0, 0)).toEqual(WHITE)
    expect(copy.get(0, 0)).toEqual(BLACK)
  })

  it('round-trips through image data', () => {
    const bitmap = new Bitmap(2, 2)
    bitmap.set(1, 1, rgba(10, 20, 30, 200))
    const restored = Bitmap.fromImageData(bitmap.toImageData())
    expect(restored.width).toBe(2)
    expect(restored.height).toBe(2)
    expect(restored.get(1, 1)).toEqual(rgba(10, 20, 30, 200))
  })

  it('enforces a minimum size of one pixel', () => {
    const bitmap = new Bitmap(0, -5)
    expect(bitmap.width).toBe(1)
    expect(bitmap.height).toBe(1)
  })
})
