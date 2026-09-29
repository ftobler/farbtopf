import { describe, expect, it } from 'vitest'
import { BLACK, WHITE } from './color'
import { strokeColorFor, strokeWidthFor } from './tools'

describe('strokeWidthFor', () => {
  it('forces the pencil to a single pixel', () => {
    expect(strokeWidthFor('pencil', 1)).toBe(1)
    expect(strokeWidthFor('pencil', 32)).toBe(1)
  })

  it('honours the brush size for other tools', () => {
    expect(strokeWidthFor('brush', 12)).toBe(12)
    expect(strokeWidthFor('eraser', 5)).toBe(5)
    expect(strokeWidthFor('shape', 8)).toBe(8)
  })
})

describe('strokeColorFor', () => {
  it('always uses the secondary colour for the eraser', () => {
    expect(strokeColorFor('eraser', 'primary', BLACK, WHITE)).toBe(WHITE)
    expect(strokeColorFor('eraser', 'secondary', BLACK, WHITE)).toBe(WHITE)
  })

  it('uses the slot colour for other tools', () => {
    expect(strokeColorFor('brush', 'primary', BLACK, WHITE)).toBe(BLACK)
    expect(strokeColorFor('brush', 'secondary', BLACK, WHITE)).toBe(WHITE)
  })
})
