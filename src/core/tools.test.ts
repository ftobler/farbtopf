import { describe, expect, it } from 'vitest'
import { strokeWidthFor } from './tools'

describe('strokeWidthFor', () => {
  it('forces the pencil to a single pixel', () => {
    expect(strokeWidthFor('pencil', 1)).toBe(1)
    expect(strokeWidthFor('pencil', 32)).toBe(1)
  })

  it('honours the brush size for other tools', () => {
    expect(strokeWidthFor('brush', 12)).toBe(12)
    expect(strokeWidthFor('eraser', 5)).toBe(5)
    expect(strokeWidthFor('line', 8)).toBe(8)
  })
})
