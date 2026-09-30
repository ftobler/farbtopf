import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const RED = { r: 255, g: 0, b: 0, a: 255 }

function setup(tool: 'select' | 'text' = 'select', width = 20, height = 20) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={width}
      initialHeight={height}
      tool={tool}
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      onSelectionChange={vi.fn()}
      onZoomClick={vi.fn()}
      transparentSelection={false}
      selectionShape="rectangle"
      onTextChange={vi.fn()}
    />,
  )
  const canvas = container.querySelector('canvas') as HTMLCanvasElement
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  const pixel = (x: number, y: number) => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
    return Array.from(image.data.slice((y * width + x) * 4, (y * width + x) * 4 + 4))
  }
  const drag = (from: [number, number], to: [number, number], pointerId = 1) => {
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: from[0], clientY: from[1] })
    fireEvent.pointerMove(canvas, { pointerId, clientX: to[0], clientY: to[1] })
    fireEvent.pointerUp(canvas, { pointerId, clientX: to[0], clientY: to[1] })
  }
  return { ref, canvas, container, pixel, drag, onHistoryChange }
}

describe('PaintCanvas clickOutside', () => {
  it('clears a plain selection', () => {
    const { ref, drag } = setup()
    drag([2, 2], [6, 6])
    expect(ref.current?.getSelection()).not.toBeNull()
    act(() => ref.current?.clickOutside(-50, -50))
    expect(ref.current?.getSelection()).toBeNull()
  })

  it('stamps a moved selection into the image before clearing it, as one undo step', () => {
    const { ref, drag, pixel } = setup('select', 40, 40)
    const doc = new Bitmap(40, 40, WHITE)
    doc.set(2, 2, RED)
    act(() => ref.current?.loadBitmap(doc))
    drag([2, 2], [17, 17])
    drag([6, 6], [26, 6], 2)
    expect(ref.current?.getSelection()).toEqual({ x: 22, y: 2, width: 16, height: 16 })
    act(() => ref.current?.clickOutside(-50, -50))
    expect(ref.current?.getSelection()).toBeNull()
    expect(pixel(22, 2)).toEqual([255, 0, 0, 255])
    expect(pixel(2, 2)).toEqual([255, 255, 255, 255])
    act(() => ref.current?.undo())
    expect(pixel(2, 2)).toEqual([255, 0, 0, 255])
    expect(pixel(22, 2)).toEqual([255, 255, 255, 255])
  })

  it('stamps a flipped selection into the image', () => {
    const { ref, drag, pixel } = setup()
    const doc = new Bitmap(20, 20, WHITE)
    doc.set(2, 2, RED)
    act(() => ref.current?.loadBitmap(doc))
    drag([2, 2], [5, 2])
    act(() => ref.current?.flip('horizontal'))
    act(() => ref.current?.clickOutside(-50, -50))
    expect(ref.current?.getSelection()).toBeNull()
    expect(pixel(5, 2)).toEqual([255, 0, 0, 255])
    expect(pixel(2, 2)).toEqual([255, 255, 255, 255])
  })

  it('keeps the selection when the press lands on a resize handle past the image edge', () => {
    const { ref, drag } = setup()
    drag([10, 10], [19, 19])
    expect(ref.current?.getSelection()).toEqual({ x: 10, y: 10, width: 10, height: 10 })
    act(() => ref.current?.clickOutside(22, 22))
    expect(ref.current?.getSelection()).toEqual({ x: 10, y: 10, width: 10, height: 10 })
    act(() => ref.current?.clickOutside(30, 30))
    expect(ref.current?.getSelection()).toBeNull()
  })

  it('does nothing while a drag on the canvas is still in progress', () => {
    const { ref, canvas } = setup()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 8, clientY: 8 })
    act(() => ref.current?.clickOutside(-50, -50))
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 8, clientY: 8 })
    expect(ref.current?.getSelection()).toEqual({ x: 2, y: 2, width: 7, height: 7 })
  })

  it('commits an open text box', () => {
    const { ref, canvas, container, onHistoryChange } = setup('text', 50, 50)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    const textarea = container.querySelector('.text-editor') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'hi' } })
    act(() => ref.current?.clickOutside(-50, -50))
    expect(container.querySelector('.text-editor')).toBeNull()
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })
})
