import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDevicePixelRatio } from './useDevicePixelRatio'

type ChangeListener = () => void

function installMatchMedia() {
  const listeners = new Set<ChangeListener>()
  const matchMedia = vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (listener: ChangeListener) => listeners.add(listener),
    removeListener: (listener: ChangeListener) => listeners.delete(listener),
    addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: ChangeListener) => listeners.delete(listener),
    dispatchEvent: () => false,
  }))
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia
  return {
    matchMedia,
    fireChange: () => listeners.forEach((listener) => listener()),
    listenerCount: () => listeners.size,
  }
}

function setDevicePixelRatio(value: number) {
  Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true })
}

describe('useDevicePixelRatio', () => {
  const originalMatchMedia = window.matchMedia
  const originalRatio = window.devicePixelRatio

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    setDevicePixelRatio(originalRatio)
    vi.restoreAllMocks()
  })

  it('reports the current device pixel ratio', () => {
    setDevicePixelRatio(2)
    installMatchMedia()
    const { result } = renderHook(() => useDevicePixelRatio())
    expect(result.current).toBe(2)
  })

  it('subscribes to a resolution query for the current ratio', () => {
    setDevicePixelRatio(2)
    const media = installMatchMedia()
    renderHook(() => useDevicePixelRatio())
    expect(media.matchMedia).toHaveBeenCalledWith('(resolution: 2dppx)')
  })

  it('updates when the resolution query changes without a resize event', () => {
    setDevicePixelRatio(1)
    const media = installMatchMedia()
    const { result } = renderHook(() => useDevicePixelRatio())
    expect(result.current).toBe(1)

    act(() => {
      setDevicePixelRatio(2)
      media.fireChange()
    })

    expect(result.current).toBe(2)
  })

  it('resubscribes to the new ratio after it changes', () => {
    setDevicePixelRatio(1)
    const media = installMatchMedia()
    renderHook(() => useDevicePixelRatio())

    act(() => {
      setDevicePixelRatio(2)
      media.fireChange()
    })

    expect(media.matchMedia).toHaveBeenLastCalledWith('(resolution: 2dppx)')
    expect(media.listenerCount()).toBe(1)
  })

  it('still reacts to window resize when matchMedia is unavailable', () => {
    setDevicePixelRatio(1)
    window.matchMedia = undefined as unknown as typeof window.matchMedia
    const { result } = renderHook(() => useDevicePixelRatio())
    expect(result.current).toBe(1)

    act(() => {
      setDevicePixelRatio(3)
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current).toBe(3)
  })
})
