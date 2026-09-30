import { describe, expect, it } from 'vitest'
import { BRUSH_SIZES } from './tools'
import { sineWavePath, strokePreviewWidth } from './strokeWave'

describe('sineWavePath', () => {
  it('builds one wavelength from a crest and a mirrored trough', () => {
    expect(sineWavePath(3, 21, 12, 4.875)).toBe('M3 12C6 5.5 9 5.5 12 12S18 18.5 21 12')
  })
})

describe('strokePreviewWidth', () => {
  it('shows small sizes at their true thickness', () => {
    for (const size of [1, 2, 3, 4, 5]) expect(strokePreviewWidth(size)).toBe(size)
  })

  it('compresses large sizes but keeps them strictly increasing', () => {
    const widths = BRUSH_SIZES.map(strokePreviewWidth)
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThan(widths[i - 1])
    expect(strokePreviewWidth(32)).toBeLessThan(18)
  })
})
