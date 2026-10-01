import { createRef } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const RED = { r: 255, g: 0, b: 0, a: 255 }
const GREEN = { r: 0, g: 255, b: 0, a: 255 }

type StoredCanvas = HTMLCanvasElement & { __pixels?: Uint8ClampedArray }

const originalGetContext = HTMLCanvasElement.prototype.getContext
const originalToDataURL = HTMLCanvasElement.prototype.toDataURL

/** Encodes the first pixel and size last written to a canvas, so a stale buffer is visible. */
function signature(canvas: StoredCanvas): string {
  const pixels = canvas.__pixels
  const sample = pixels ? Array.from(pixels.slice(0, 4)).join(',') : 'empty'
  return `${canvas.width}x${canvas.height}:${sample}`
}

function setDevicePixelRatio(value: number) {
  Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true })
}

function setup(width = 20, height = 20) {
  const ref = createRef<PaintCanvasHandle>()
  render(
    <PaintCanvas
      ref={ref}
      initialWidth={width}
      initialHeight={height}
      tool="pencil"
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={vi.fn()}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      transparentSelection={false}
      selectionShape="rectangle"
    />,
  )
  return ref
}

describe('PaintCanvas toDataUrl', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = function (this: StoredCanvas) {
      return {
        canvas: this,
        putImageData: (image: { data: Uint8ClampedArray }) => {
          this.__pixels = image.data
        },
        drawImage: vi.fn(),
        clearRect: vi.fn(),
        imageSmoothingEnabled: true,
      } as unknown as CanvasRenderingContext2D
    } as unknown as typeof HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.toDataURL = function (this: StoredCanvas) {
      return `data:image/png;base64,${signature(this)}`
    } as typeof HTMLCanvasElement.prototype.toDataURL
  })

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL
    setDevicePixelRatio(1)
  })

  it('encodes the current document after the backing ratio drops back to 1', () => {
    setDevicePixelRatio(2)
    const ref = setup()

    const first = new Bitmap(20, 20, WHITE)
    first.set(0, 0, RED)
    act(() => ref.current?.loadBitmap(first))

    setDevicePixelRatio(1)
    const second = new Bitmap(20, 20, WHITE)
    second.set(0, 0, GREEN)
    act(() => ref.current?.loadBitmap(second))

    expect(ref.current?.toDataUrl()).toBe('data:image/png;base64,20x20:0,255,0,255')
  })
})
