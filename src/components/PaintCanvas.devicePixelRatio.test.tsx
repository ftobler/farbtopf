import { createRef } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

type ChangeListener = () => void

function installMatchMedia() {
  const listeners = new Set<ChangeListener>()
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (listener: ChangeListener) => listeners.add(listener),
    removeListener: (listener: ChangeListener) => listeners.delete(listener),
    addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: ChangeListener) => listeners.delete(listener),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  return { fireChange: () => listeners.forEach((listener) => listener()) }
}

function setDevicePixelRatio(value: number) {
  Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true })
}

const originalMatchMedia = window.matchMedia
const originalRatio = window.devicePixelRatio

afterEach(() => {
  window.matchMedia = originalMatchMedia
  setDevicePixelRatio(originalRatio)
  vi.restoreAllMocks()
})

function setup() {
  const ref = createRef<PaintCanvasHandle>()
  const putImageData = vi.fn()
  const drawImage = vi.fn()
  const context = {
    putImageData,
    drawImage,
    clearRect: vi.fn(),
    imageSmoothingEnabled: true,
  } as unknown as CanvasRenderingContext2D
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={20}
      initialHeight={20}
      tool="brush"
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
      shapeKind="rectangle"
      zoom={1}
      showGrid={false}
      onHistoryChange={vi.fn()}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      onSelectionChange={vi.fn()}
      onZoomClick={vi.fn()}
      transparentSelection={false}
      selectionShape="rectangle"
      brush="round"
      onTextChange={vi.fn()}
    />,
  )
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  return {
    ref,
    canvas,
    repaints: () => putImageData.mock.calls.length + drawImage.mock.calls.length,
  }
}

describe('PaintCanvas device pixel ratio', () => {
  it('repaints the current document when the resolution query changes', () => {
    setDevicePixelRatio(1)
    const media = installMatchMedia()
    const { repaints } = setup()
    const before = repaints()

    act(() => {
      setDevicePixelRatio(2)
      media.fireChange()
    })

    expect(repaints()).toBeGreaterThan(before)
  })
})
