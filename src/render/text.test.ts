import { describe, expect, it } from 'vitest'
import { BLACK } from '../core/color'
import { DEFAULT_TEXT_OPTIONS, renderText } from './text'

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
