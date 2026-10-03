import { useRef } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKeepInViewport } from './useKeepInViewport'

function Popup({ open = true }: { open?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useKeepInViewport(ref, open)
  return <div ref={ref} data-testid="popup" />
}

function mockRect(rect: Partial<DOMRect>) {
  const full = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, ...rect }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...full, toJSON: () => full } as DOMRect)
}

function setViewport(width: number, height: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
}

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(document.documentElement, 'clientWidth', { value: 0, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true })
})

describe('useKeepInViewport', () => {
  it('leaves a popup that fits alone', () => {
    setViewport(1280, 800)
    mockRect({ left: 100, right: 300, top: 50, bottom: 250 })
    render(<Popup />)
    const popup = screen.getByTestId('popup')
    expect(popup.style.getPropertyValue('translate')).toBe('')
    expect(popup.style.getPropertyValue('max-height')).toBe('')
  })

  it('shifts a popup that spills past the right edge back on screen', () => {
    setViewport(375, 812)
    mockRect({ left: 250, right: 490, top: 50, bottom: 250 })
    render(<Popup />)
    expect(screen.getByTestId('popup').style.getPropertyValue('translate')).toBe('-123px 0')
  })

  it('keeps the left edge on screen when the popup is wider than the viewport', () => {
    setViewport(320, 812)
    mockRect({ left: 20, right: 420, top: 50, bottom: 250 })
    render(<Popup />)
    expect(screen.getByTestId('popup').style.getPropertyValue('translate')).toBe('-12px 0')
  })

  it('caps the height of a popup that runs off the bottom', () => {
    setViewport(375, 400)
    mockRect({ left: 10, right: 200, top: 100, bottom: 700 })
    render(<Popup />)
    const popup = screen.getByTestId('popup')
    expect(popup.style.getPropertyValue('max-height')).toBe('292px')
    expect(popup.style.getPropertyValue('overflow-y')).toBe('auto')
  })

  it('does nothing while closed', () => {
    setViewport(375, 812)
    mockRect({ left: 250, right: 490, top: 50, bottom: 250 })
    render(<Popup open={false} />)
    expect(screen.getByTestId('popup').style.getPropertyValue('translate')).toBe('')
  })
})
