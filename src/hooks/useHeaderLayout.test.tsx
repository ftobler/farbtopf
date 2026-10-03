import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockMatchMedia, restoreMatchMedia } from '../test/matchMedia'
import { COMPACT_QUERY, PHONE_QUERY, SINGLE_ROW_QUERY, useHeaderLayout, useMediaQuery } from './useHeaderLayout'

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

describe('useHeaderLayout', () => {
  it('keeps the full desktop ribbon when no query matches', () => {
    mockMatchMedia()
    expect(renderHook(() => useHeaderLayout()).result.current).toBe('full')
  })

  it('goes compact below the desktop width', () => {
    mockMatchMedia([COMPACT_QUERY])
    expect(renderHook(() => useHeaderLayout()).result.current).toBe('compact')
  })

  it('uses the phone layout on a narrow screen', () => {
    mockMatchMedia([COMPACT_QUERY, PHONE_QUERY])
    expect(renderHook(() => useHeaderLayout()).result.current).toBe('phone')
  })

  it('folds into a single row on a short landscape screen', () => {
    mockMatchMedia([COMPACT_QUERY, SINGLE_ROW_QUERY])
    expect(renderHook(() => useHeaderLayout()).result.current).toBe('single-row')
  })

  it('ignores a short window that is wide enough for the desktop ribbon', () => {
    mockMatchMedia([SINGLE_ROW_QUERY])
    expect(renderHook(() => useHeaderLayout()).result.current).toBe('full')
  })

  it('updates when the window is resized across a breakpoint', () => {
    const media = mockMatchMedia()
    const { result } = renderHook(() => useHeaderLayout())
    media.setMatching([COMPACT_QUERY, PHONE_QUERY])
    expect(result.current).toBe('phone')
    media.setMatching([])
    expect(result.current).toBe('full')
  })
})
