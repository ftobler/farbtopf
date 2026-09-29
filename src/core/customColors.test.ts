import { beforeEach, describe, expect, it } from 'vitest'
import { rgba } from './color'
import {
  CUSTOM_COLORS_KEY,
  loadCustomColors,
  saveCustomColors,
  withCustomColor,
} from './customColors'

describe('custom colors storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips saved colors', () => {
    saveCustomColors(['#ff0000', '#00ff0080'])
    expect(loadCustomColors()).toEqual(['#ff0000', '#00ff0080'])
  })

  it('loads nothing when storage is empty', () => {
    expect(loadCustomColors()).toEqual([])
  })

  it('ignores malformed storage', () => {
    localStorage.setItem(CUSTOM_COLORS_KEY, 'not json')
    expect(loadCustomColors()).toEqual([])
    localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify({ nope: true }))
    expect(loadCustomColors()).toEqual([])
  })

  it('drops invalid entries and duplicates', () => {
    localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(['#f00', 'nope', 7, '#ff0000']))
    expect(loadCustomColors()).toEqual(['#ff0000'])
  })

  it('appends a new color and keeps an existing one', () => {
    expect(withCustomColor([], rgba(255, 0, 0))).toEqual(['#ff0000'])
    expect(withCustomColor(['#ff0000'], rgba(255, 0, 0))).toEqual(['#ff0000'])
    expect(withCustomColor(['#ff0000'], rgba(0, 0, 255, 128))).toEqual(['#ff0000', '#0000ff80'])
  })
})
