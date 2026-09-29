import { describe, expect, it } from 'vitest'
import {
  BLACK,
  WHITE,
  colorsEqual,
  contrasting,
  hsvToRgb,
  luminance,
  mix,
  parseColor,
  rgbToHsv,
  rgba,
  toCss,
  toHex,
  toHexWithAlpha,
} from './color'

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#ff8000')).toEqual({ r: 255, g: 128, b: 0, a: 255 })
  })

  it('parses 3-digit shorthand', () => {
    expect(parseColor('#f80')).toEqual({ r: 255, g: 136, b: 0, a: 255 })
  })

  it('parses alpha', () => {
    expect(parseColor('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 128 })
  })

  it('rejects invalid input', () => {
    expect(parseColor('nope')).toBeNull()
    expect(parseColor('#12')).toBeNull()
    expect(parseColor('#gggggg')).toBeNull()
  })
})

describe('toHex / toCss', () => {
  it('round-trips through toHex', () => {
    const color = rgba(12, 34, 56)
    expect(parseColor(toHex(color))).toEqual(color)
  })

  it('formats opaque colors', () => {
    expect(toCss(rgba(1, 2, 3))).toBe('rgb(1, 2, 3)')
  })

  it('formats translucent colors', () => {
    expect(toCss(rgba(1, 2, 3, 128))).toBe('rgba(1, 2, 3, 0.502)')
  })
})

describe('toHexWithAlpha', () => {
  it('omits the alpha channel when opaque', () => {
    expect(toHexWithAlpha(rgba(12, 34, 56))).toBe('#0c2238')
  })

  it('keeps the alpha channel when translucent', () => {
    expect(toHexWithAlpha(rgba(12, 34, 56, 128))).toBe('#0c223880')
  })
})

describe('colorsEqual', () => {
  it('respects tolerance', () => {
    expect(colorsEqual(rgba(10, 10, 10), rgba(12, 12, 12), 2)).toBe(true)
    expect(colorsEqual(rgba(10, 10, 10), rgba(13, 13, 13), 2)).toBe(false)
  })
})

describe('hsv round trip', () => {
  it('restores primary colors', () => {
    for (const color of [rgba(255, 0, 0), rgba(0, 255, 0), rgba(0, 0, 255), rgba(64, 128, 192)]) {
      expect(hsvToRgb(rgbToHsv(color))).toEqual(color)
    }
  })
})

describe('color helpers', () => {
  it('mixes halfway', () => {
    expect(mix(BLACK, WHITE, 0.5)).toEqual(rgba(128, 128, 128))
  })

  it('computes luminance extremes', () => {
    expect(luminance(BLACK)).toBe(0)
    expect(luminance(WHITE)).toBeCloseTo(1)
  })

  it('picks a contrasting color', () => {
    expect(contrasting(BLACK)).toEqual(WHITE)
    expect(contrasting(WHITE)).toEqual(BLACK)
  })
})
