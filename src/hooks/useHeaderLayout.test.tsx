import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockMatchMedia, restoreMatchMedia } from '../test/matchMedia'
import {
  COMPACT_QUERY,
  MEDIUM_QUERY,
  PHONE_QUERY,
  SINGLE_ROW_QUERY,
  useHeaderLayout,
  useMediaQuery,
} from './useHeaderLayout'

afterEach(restoreMatchMedia)

describe('useMediaQuery', () => {
  it('follows the query as it starts and stops matching', () => {
    const media = mockMatchMedia()
    const { result } = renderHook(() => useMediaQuery('(max-width: 600px)'))
    expect(result.current).toBe(false)
    media.setMatching(['(max-width: 600px)'])
    expect(result.current).toBe(true)
    media.setMatching([])
    expect(result.current).toBe(false)
  })
})

describe('header breakpoints', () => {
  const maxWidth = (query: string) => Number(/max-width: ([\d.]+)px/.exec(query)![1])

  it('fold the desktop ribbon to medium before the compact and phone layouts', () => {
    expect(maxWidth(MEDIUM_QUERY)).toBeGreaterThan(maxWidth(COMPACT_QUERY))
    expect(maxWidth(MEDIUM_QUERY)).toBeGreaterThan(maxWidth(PHONE_QUERY))
  })
})

describe('useHeaderLayout', () => {
  it('keeps the full desktop ribbon when no query matches', () => {
    mockMatchMedia()
    expect(renderHook(() => useHeaderLayout()).result.current).toBe('full')
  })

  it('folds shapes and colours (medium) just below the desktop width', () => {
    mockMatchMedia([MEDIUM_QUERY])
    expect(renderHook(() => useHeaderLayout()).result.current).toBe('medium')
  })

  it('folds a short landscape window below the desktop width into a single row, not the tall medium ribbon', () => {
    mockMatchMedia([MEDIUM_QUERY, SINGLE_ROW_QUERY])
    expect(renderHook(() => useHeaderLayout()).result.current).toBe('single-row')
  })

  it('goes compact below the medium width', () => {
    mockMatchMedia([MEDIUM_QUERY, COMPACT_QUERY])
    expect(renderHook(() => useHeaderLayout()).result.current).toBe('compact')
  })

  it('uses the phone layout on a narrow screen', () => {
    mockMatchMedia([MEDIUM_QUERY, COMPACT_QUERY, PHONE_QUERY])
    expect(renderHook(() => useHeaderLayout()).result.current).toBe('phone')
  })

  it('folds into a single row on a short landscape screen', () => {
    mockMatchMedia([MEDIUM_QUERY, COMPACT_QUERY, SINGLE_ROW_QUERY])
    expect(renderHook(() => useHeaderLayout()).result.current).toBe('single-row')
  })

  it('ignores a short window that is wide enough for the desktop ribbon', () => {
    mockMatchMedia([SINGLE_ROW_QUERY])
    expect(renderHook(() => useHeaderLayout()).result.current).toBe('full')
  })

  it('updates when the window is resized across a breakpoint', () => {
    const media = mockMatchMedia()
    const { result } = renderHook(() => useHeaderLayout())
    media.setMatching([MEDIUM_QUERY])
    expect(result.current).toBe('medium')
    media.setMatching([MEDIUM_QUERY, COMPACT_QUERY, PHONE_QUERY])
    expect(result.current).toBe('phone')
    media.setMatching([])
    expect(result.current).toBe('full')
  })
})
