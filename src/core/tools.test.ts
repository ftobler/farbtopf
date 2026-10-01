import { describe, expect, it } from 'vitest'
import { BLACK, WHITE } from './color'
import { rightClickActs, strokeColorFor, strokeWidthFor } from './tools'

describe('strokeWidthFor', () => {
  it('honours the size for the pencil too', () => {
    expect(strokeWidthFor('pencil', 1)).toBe(1)
    expect(strokeWidthFor('pencil', 32)).toBe(32)
  })

  it('clamps sizes to whole pixels from 1 to 500', () => {
    expect(strokeWidthFor('brush', 0)).toBe(1)
    expect(strokeWidthFor('eraser', 500)).toBe(500)
    expect(strokeWidthFor('shape', 900)).toBe(500)
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

describe('rightClickActs', () => {
  it('is true for the tools that act on a right click', () => {
    expect(rightClickActs('zoom')).toBe(true)
    expect(rightClickActs('fill')).toBe(true)
    expect(rightClickActs('picker')).toBe(true)
  })

  it('is false for the tools that leave a right click to the context menu', () => {
    expect(rightClickActs('select')).toBe(false)
    expect(rightClickActs('text')).toBe(false)
    expect(rightClickActs('shape')).toBe(false)
  })
})
