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

  it('wraps words at the max width', () => {
    const bitmap = renderText('aaaa bbbb cccc', { ...base, maxWidth: 80 })
    expect(bitmap?.width).toBe(58)
    expect(bitmap?.height).toBe(30)
  })

  it('breaks a word that is wider than the max width', () => {
    const bitmap = renderText('aaaaaaaaaaaaaaa', { ...base, maxWidth: 50 })
    expect(bitmap?.width).toBe(46)
    expect(bitmap?.height).toBe(43)
  })

  it('wraps each explicit line independently', () => {
    const bitmap = renderText('aaa\nbbbbbbbbb', { ...base, maxWidth: 40 })
    expect(bitmap?.width).toBe(40)
    expect(bitmap?.height).toBe(43)
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
