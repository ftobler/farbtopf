import { describe, expect, it } from 'vitest'
import { parseColor } from './color'
import { DEFAULT_PALETTE, PALETTE_COLUMNS } from './palette'

function lightness(hex: string): number {
  const color = parseColor(hex)!
  return (Math.max(color.r, color.g, color.b) + Math.min(color.r, color.g, color.b)) / 2
}

describe('DEFAULT_PALETTE', () => {
  it('has 20 colours laid out column by column, top then bottom', () => {
    expect(DEFAULT_PALETTE).toHaveLength(20)
    expect(DEFAULT_PALETTE).toEqual(PALETTE_COLUMNS.flatMap((column) => [column.top, column.bottom]))
    expect(new Set(DEFAULT_PALETTE).size).toBe(20)
  })

  it('starts with black over white, then two greys', () => {
    expect(PALETTE_COLUMNS[0]).toEqual({ top: '#000000', bottom: '#ffffff' })
    const greys = PALETTE_COLUMNS[1]
    for (const hex of [greys.top, greys.bottom]) {
      const { r, g, b } = parseColor(hex)!
      expect(r === g && g === b).toBe(true)
    }
  })

  it('puts the saturated colour on top and a brighter pastel below', () => {
    for (const column of PALETTE_COLUMNS) {
      expect(lightness(column.bottom)).toBeGreaterThan(lightness(column.top))
    }
  })
})
