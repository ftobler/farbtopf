import { describe, expect, it } from 'vitest'
import { BLACK } from '../core/color'
import { DEFAULT_TEXT_OPTIONS, renderText, renderTextSubpixel } from './text'

const base = { ...DEFAULT_TEXT_OPTIONS, color: BLACK, fontSize: 10, lineHeight: 1.25 }

describe('renderText', () => {
  it('keeps a single line wide enough for the whole string without a max width', () => {
    const bitmap = renderText('aaaa bbbb', base)
    expect(bitmap?.width).toBe(58)
    expect(bitmap?.height).toBe(17)
  })

  it('advances each line by exactly fontSize * lineHeight', () => {
    renderText('a\nb', base)
    const getContext = HTMLCanvasElement.prototype.getContext as unknown as {
      mock: { results: { value: { fillText: { mock: { calls: unknown[][] } } } }[] }
    }
    const context = getContext.mock.results.at(-1)?.value
    const baselines = context?.fillText.mock.calls.map((call) => call[2] as number) ?? []
    expect(baselines[1] - baselines[0]).toBeCloseTo(base.fontSize * base.lineHeight, 5)
  })

  it('wraps words at the max width', () => {
    const bitmap = renderText('aaaa bbbb cccc', { ...base, maxWidth: 80 })
    expect(bitmap?.width).toBe(58)
    expect(bitmap?.height).toBe(29)
  })

  it('breaks a word that is wider than the max width', () => {
    const bitmap = renderText('aaaaaaaaaaaaaaa', { ...base, maxWidth: 50 })
    expect(bitmap?.width).toBe(46)
    expect(bitmap?.height).toBe(42)
  })

  it('wraps each explicit line independently', () => {
    const bitmap = renderText('aaa\nbbbbbbbbb', { ...base, maxWidth: 40 })
    expect(bitmap?.width).toBe(40)
    expect(bitmap?.height).toBe(42)
  })

  it('never grows wider than the max width', () => {
    const bitmap = renderText('short', { ...base, maxWidth: 12 })
    expect(bitmap?.width).toBeLessThanOrEqual(12)
  })

  it('returns a single empty line for empty text', () => {
    const bitmap = renderText('', base)
    expect(bitmap?.height).toBe(17)
  })
})

/** Makes canvases hand back glyph pixels whose alpha ramps 0, 40, 80, ... per pixel. */
function withGlyphRamp() {
  const calls = { setTransform: [] as number[][], widths: [] as number[] }
  const original = HTMLCanvasElement.prototype.getContext
  const fake = function (this: HTMLCanvasElement) {
    return {
      font: '',
      fillStyle: '',
      textBaseline: '',
      measureText: (value: string) => ({ width: value.length * 6 }),
      fillText: () => {},
      fillRect: () => {},
      setTransform: (...args: number[]) => {
        calls.setTransform.push(args)
      },
      getImageData: (_x: number, _y: number, width: number, height: number) => {
        // Arrow function: `this` is the canvas the context was asked of.
        calls.widths.push(this.width)
        const data = new Uint8ClampedArray(width * height * 4)
        for (let i = 0; i < width * height; i += 1) {
          data[i * 4] = 20
          data[i * 4 + 1] = 30
          data[i * 4 + 2] = 40
          data[i * 4 + 3] = (i * 40) % 256
        }
        return { width, height, data }
      },
    }
  }
  HTMLCanvasElement.prototype.getContext = fake as unknown as typeof HTMLCanvasElement.prototype.getContext
  return {
    calls,
    restore: () => {
      HTMLCanvasElement.prototype.getContext = original
    },
  }
}

describe('renderText anti-aliasing', () => {
  it('is on by default and subpixel rendering off', () => {
    expect(DEFAULT_TEXT_OPTIONS.antialias).toBe(true)
    expect(DEFAULT_TEXT_OPTIONS.subpixel).toBe(false)
  })

  it('passes the rasterised glyphs through untouched with anti-aliasing on', () => {
    const ramp = withGlyphRamp()
    try {
      const bitmap = renderText('ab', base)
      expect(bitmap?.get(0, 0)).toEqual({ r: 20, g: 30, b: 40, a: 0 })
      expect(bitmap?.get(1, 0)).toEqual({ r: 20, g: 30, b: 40, a: 40 })
      expect(bitmap?.get(3, 0)).toEqual({ r: 20, g: 30, b: 40, a: 120 })
    } finally {
      ramp.restore()
    }
  })

  it('leaves only fully opaque text colour or nothing with anti-aliasing off', () => {
    const ramp = withGlyphRamp()
    const color = { r: 200, g: 10, b: 10, a: 255 }
    try {
      const bitmap = renderText('ab', { ...base, color, antialias: false })
      if (!bitmap) throw new Error('no bitmap')
      for (let y = 0; y < bitmap.height; y += 1) {
        for (let x = 0; x < bitmap.width; x += 1) {
          const pixel = bitmap.get(x, y)
          if (pixel.a !== 0) expect(pixel).toEqual(color)
        }
      }
      // Pixel 3 has alpha 120 (below half), pixel 4 alpha 160 (above).
      expect(bitmap.get(3, 0).a).toBe(0)
      expect(bitmap.get(4, 0).a).toBe(255)
    } finally {
      ramp.restore()
    }
  })
})

describe('renderTextSubpixel', () => {
  it('rasterises at three times the width and returns per-pixel R, G, B coverage of the same size', () => {
    const plain = renderText('aaaa bbbb', base)
    if (!plain) throw new Error('no bitmap')
    const ramp = withGlyphRamp()
    try {
      const coverage = renderTextSubpixel('aaaa bbbb', base)
      expect(coverage?.width).toBe(plain.width)
      expect(coverage?.height).toBe(plain.height)
      expect(coverage?.data.length).toBe(plain.width * plain.height * 3)
      expect(ramp.calls.widths.at(-1)).toBe(plain.width * 3)
      expect(ramp.calls.setTransform.at(-1)).toEqual([3, 0, 0, 1, 0, 0])
      // The ramp changes from one subpixel to the next, so the channels differ.
      const [r, g, b] = Array.from(coverage?.data.slice(3, 6) ?? [])
      expect(r === g && g === b).toBe(false)
    } finally {
      ramp.restore()
    }
  })
})
