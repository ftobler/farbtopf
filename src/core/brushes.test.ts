import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BRUSHES, brushById, isColorBrush, paintBrushStroke } from './brushes'
import { BLACK, WHITE } from './color'

function countNonWhite(bitmap: Bitmap): number {
  let count = 0
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      if (bitmap.get(x, y).r < 255) count += 1
    }
  }
  return count
}

describe('brushes', () => {
  it('lists the eight brushes in order', () => {
    expect(BRUSHES.map((brush) => brush.id)).toEqual([
      'round',
      'soft',
      'natural',
      'calligraphy',
      'highlighter',
      'blur',
      'smudge',
      'liquify',
    ])
    expect(BRUSHES.map((brush) => brush.label)).toEqual([
      'Circle sharp',
      'Circle blurred',
      'Natural brush',
      'Calligraphy pen',
      'Highlighter pen',
      'Selective blurring',
      'Smudge',
      'Liquify',
    ])
  })

  it('finds brushes by id', () => {
    expect(brushById('smudge').label).toBe('Smudge')
    expect(() => brushById('nope' as never)).toThrow()
  })

  it('knows which brushes lay down colour', () => {
    expect(isColorBrush('round')).toBe(true)
    expect(isColorBrush('natural')).toBe(true)
    expect(isColorBrush('highlighter')).toBe(true)
    expect(isColorBrush('blur')).toBe(false)
    expect(isColorBrush('smudge')).toBe(false)
    expect(isColorBrush('liquify')).toBe(false)
  })

  it('paints a crisp circle with the round brush', () => {
    const bitmap = new Bitmap(20, 20, WHITE)
    paintBrushStroke(bitmap, { x: 10, y: 10 }, { x: 10, y: 10 }, { size: 6, color: BLACK, brush: 'round' })
    expect(bitmap.get(10, 10).r).toBe(0)
    expect(bitmap.get(0, 0).r).toBe(255)
  })

  it('feathers the edge with the circle blurred brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 17, color: BLACK, brush: 'soft' })
    expect(bitmap.get(20, 20).r).toBeLessThan(10)
    const edge = bitmap.get(27, 20).r
    expect(edge).toBeGreaterThan(200)
    expect(edge).toBeLessThan(255)
  })

  it('scatters bristles with the natural brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 12, color: BLACK, brush: 'natural' })
    expect(countNonWhite(bitmap)).toBeGreaterThan(3)
  })

  it('paints a slanted nib with the calligraphy brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 12, color: BLACK, brush: 'calligraphy' })
    expect(countNonWhite(bitmap)).toBeGreaterThan(4)
    expect(bitmap.get(20, 20).r).toBeLessThan(255)
  })

  it('leaves translucent ink with the highlighter', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 12, color: BLACK, brush: 'highlighter' })
    const painted = bitmap.get(20, 20).r
    expect(painted).toBeGreaterThan(0)
    expect(painted).toBeLessThan(255)
  })

  it('softens a hard edge with selective blurring', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    bitmap.set(20, 20, BLACK)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 8, color: BLACK, brush: 'blur' })
    expect(bitmap.get(20, 20).r).toBeGreaterThan(0)
    expect(bitmap.get(21, 20).r).toBeLessThan(255)
  })

  it('drags colour along with the smudge brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 20; x += 1) bitmap.set(x, y, BLACK)
    }
    paintBrushStroke(bitmap, { x: 18, y: 20 }, { x: 22, y: 20 }, { size: 8, color: BLACK, brush: 'smudge' })
    expect(bitmap.get(21, 20).r).toBeLessThan(255)
  })

  it('pushes pixels with the liquify brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    bitmap.set(20, 20, BLACK)
    paintBrushStroke(bitmap, { x: 18, y: 20 }, { x: 22, y: 20 }, { size: 8, color: BLACK, brush: 'liquify' })
    expect(bitmap.get(22, 20).r).toBeLessThan(128)
  })
})
