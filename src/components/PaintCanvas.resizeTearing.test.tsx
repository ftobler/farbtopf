import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'

const SIZE = 20
const ZOOM = 2

describe('PaintCanvas canvas resize drag', () => {
  it('resizes the on-screen frame before the new pixels are painted, so the image never stretches', () => {
    const { container } = render(
      <PaintCanvas
        initialWidth={SIZE}
        initialHeight={SIZE}
        tool="pencil"
        primary={BLACK}
        secondary={WHITE}
        brushSize={1}
        shapeFill="outline"
        zoom={ZOOM}
        pan={{ x: 0, y: 0 }}
        showGrid={false}
        onHistoryChange={vi.fn()}
        onCursorMove={vi.fn()}
        onPickColor={vi.fn()}
        onSizeChange={vi.fn()}
        transparentSelection={false}
      />,
    )
    const frame = container.querySelector<HTMLElement>('.canvas-frame')
    const canvas = container.querySelector<HTMLCanvasElement>('.paint-canvas')
    const handle = container.querySelector<HTMLElement>('.canvas-resize-handle-e')
    if (!frame || !canvas || !handle) throw new Error('not rendered')
    frame.getBoundingClientRect = () => ({ left: 0, top: 0, width: SIZE * ZOOM, height: SIZE * ZOOM }) as DOMRect

    // Whenever the backing store changes size, note the frame's CSS width at that moment.
    const seen: [number, string][] = []
    const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width')
    Object.defineProperty(canvas, 'width', {
      configurable: true,
      get() {
        return descriptor?.get?.call(this)
      },
      set(value: number) {
        seen.push([value, frame.style.width])
        descriptor?.set?.call(this, value)
      },
    })

    handle.setPointerCapture = vi.fn()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: SIZE * ZOOM, clientY: 10 })
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 30 * ZOOM, clientY: 10 })

    expect(seen.length).toBeGreaterThan(0)
    // jsdom's device pixel ratio is 1, so the backing width is the image width.
    for (const [backing, css] of seen) expect(css).toBe(`${backing * ZOOM}px`)
    expect(seen.at(-1)?.[0]).toBe(30)
  })
})
