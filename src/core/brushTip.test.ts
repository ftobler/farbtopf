import { describe, expect, it } from 'vitest'
import { BLACK, rgba } from './color'
import { TIP_PADDING, brushTip, tipKind } from './brushTip'

const RED = rgba(255, 0, 0)

function covered(bitmap: { width: number; height: number; get: (x: number, y: number) => { a: number } }) {
  let count = 0
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) if (bitmap.get(x, y).a > 0) count += 1
  }
  return count
}

describe('tipKind', () => {
  it('names the form of each tool and brush tip', () => {
    expect(tipKind('pencil', 'round')).toBe('square')
    expect(tipKind('eraser', 'round')).toBe('square')
    expect(tipKind('shape', 'calligraphy')).toBe('round')
    expect(tipKind('airbrush', 'round')).toBe('spray')
    expect(tipKind('brush', 'round')).toBe('round')
    expect(tipKind('brush', 'soft')).toBe('soft')
    expect(tipKind('brush', 'natural')).toBe('natural')
    expect(tipKind('brush', 'calligraphy')).toBe('calligraphy')
    expect(tipKind('brush', 'highlighter')).toBe('highlighter')
    expect(tipKind('brush', 'blur')).toBe('area')
    expect(tipKind('brush', 'smudge')).toBe('area')
    expect(tipKind('brush', 'liquify')).toBe('area')
  })
})

describe('brushTip', () => {
  it('is the tip plus a small margin on every side', () => {
    const tip = brushTip('brush', 'round', 12, BLACK)
    expect(tip?.width).toBe(12 + 2 * TIP_PADDING)
    expect(tip?.height).toBe(12 + 2 * TIP_PADDING)
  })

  it('draws the eraser as a full square in the given colour', () => {
    const tip = brushTip('eraser', 'round', 6, RED)
    expect(tip).not.toBeNull()
    expect(covered(tip!)).toBe(36)
    expect(tip!.get(TIP_PADDING, TIP_PADDING)).toEqual(RED)
    expect(tip!.get(TIP_PADDING + 5, TIP_PADDING + 5)).toEqual(RED)
    expect(tip!.get(TIP_PADDING - 1, TIP_PADDING)).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })

  it('draws a round brush as a disc that leaves the corners empty', () => {
    const tip = brushTip('brush', 'round', 10, BLACK)!
    const middle = TIP_PADDING + 4
    expect(tip.get(middle, middle).a).toBe(255)
    expect(tip.get(TIP_PADDING, TIP_PADDING).a).toBe(0)
    expect(covered(tip)).toBeGreaterThan(60)
    expect(covered(tip)).toBeLessThan(100)
  })

  it('draws the calligraphy nib as a slanted sliver', () => {
    const tip = brushTip('brush', 'calligraphy', 20, BLACK)!
    const disc = brushTip('brush', 'round', 20, BLACK)!
    expect(covered(tip)).toBeLessThan(covered(disc) / 2)
    expect(covered(tip)).toBeGreaterThan(0)
  })

  it('draws the highlighter translucent', () => {
    const tip = brushTip('brush', 'highlighter', 12, BLACK)!
    const middle = TIP_PADDING + 5
    expect(tip.get(middle, middle).a).toBeGreaterThan(0)
    expect(tip.get(middle, middle).a).toBeLessThan(255)
  })

  it('has no painted tip for the distorting brushes', () => {
    expect(brushTip('brush', 'blur', 12, BLACK)).toBeNull()
    expect(brushTip('brush', 'liquify', 12, BLACK)).toBeNull()
  })

  it('handles 1 px and 500 px tips', () => {
    expect(covered(brushTip('pencil', 'round', 1, BLACK)!)).toBe(1)
    const huge = brushTip('shape', 'round', 500, BLACK)!
    expect(huge.width).toBe(500 + 2 * TIP_PADDING)
    expect(huge.get(TIP_PADDING + 250, TIP_PADDING + 250).a).toBe(255)
    expect(huge.get(TIP_PADDING + 250, TIP_PADDING + 1).a).toBe(255)
  })
})
