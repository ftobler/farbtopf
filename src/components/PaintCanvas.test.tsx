import { createRef } from 'react'
import { act, render } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

function setup(
  tool: 'brush' | 'rectangle' | 'select',
  width = 20,
  height = 20,
  transparentSelection = false,
  selectionShape: 'rectangle' | 'freeform' = 'rectangle',
) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const onCursorMove = vi.fn()
  const onPickColor = vi.fn()
  const onSizeChange = vi.fn()
  const onSelectionChange = vi.fn()

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
      onCursorMove={onCursorMove}
      onPickColor={onPickColor}
      onSizeChange={onSizeChange}
      onSelectionChange={onSelectionChange}
      transparentSelection={transparentSelection}
      selectionShape={selectionShape}
    />,
  )

  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  return { ref, canvas, onHistoryChange, onSizeChange, onSelectionChange }
}

describe('PaintCanvas', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('records history when a freehand stroke is drawn', () => {
    const { canvas, onHistoryChange } = setup('brush')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 9, clientY: 5 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 9, clientY: 5 })
    expect(onHistoryChange).toHaveBeenCalled()
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('supports undo after drawing', () => {
    const { ref, canvas, onHistoryChange } = setup('brush')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 2, clientY: 2 })
    act(() => ref.current?.undo())
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
    act(() => ref.current?.redo())
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('commits a shape stroke on pointer up', () => {
    const { ref, canvas, onHistoryChange } = setup('rectangle')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 10, clientY: 10 })
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    act(() => ref.current?.undo())
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
  })

  it('reports the document size', () => {
    const { ref } = setup('brush')
    expect(ref.current?.getSize()).toEqual({ width: 20, height: 20 })
  })

  it('resizes the document and notifies the size change', () => {
    const { ref, onSizeChange } = setup('brush')
    act(() => ref.current?.resize(10, 30))
    expect(ref.current?.getSize()).toEqual({ width: 10, height: 30 })
    expect(onSizeChange).toHaveBeenLastCalledWith(10, 30)
  })

  it('rotates a non-square document, swapping its dimensions', () => {
    const { ref } = setup('brush', 20, 10)
    act(() => ref.current?.rotate(90))
    expect(ref.current?.getSize()).toEqual({ width: 10, height: 20 })
  })

  it('flips horizontally without changing the size and records history', () => {
    const { ref, onHistoryChange } = setup('brush')
    act(() => ref.current?.flip('horizontal'))
    expect(ref.current?.getSize()).toEqual({ width: 20, height: 20 })
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('tracks a rectangular selection drag', () => {
    const { ref, canvas, onSelectionChange } = setup('select')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 8, clientY: 7 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 8, clientY: 7 })
    expect(ref.current?.getSelection()).toEqual({ x: 2, y: 2, width: 7, height: 6 })
    expect(onSelectionChange).toHaveBeenCalledWith(true)
  })

  it('crops to the selection', () => {
    const { ref, canvas } = setup('select')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 8, clientY: 7 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 8, clientY: 7 })
    act(() => ref.current?.cropToSelection())
    expect(ref.current?.getSize()).toEqual({ width: 7, height: 6 })
  })

  it('clears the selection on a bare click', () => {
    const { ref, canvas } = setup('select')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 4, clientY: 4 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 4, clientY: 4 })
    expect(ref.current?.getSelection()).toBeNull()
  })

  it('moves a selection when dragged from inside', () => {
    const { ref, canvas, onHistoryChange } = setup('select', 30, 30)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 15, clientY: 15 })
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 15, clientY: 15 })
    expect(ref.current?.getSelection()).toEqual({ x: 7, y: 7, width: 18, height: 18 })
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('moves pixels and fills the vacated area with the secondary colour', () => {
    const { ref, canvas } = setup('select', 30, 30)
    const context = { putImageData: vi.fn() }
    canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
    const doc = new Bitmap(30, 30, WHITE)
    doc.set(5, 5, BLACK)
    act(() => ref.current?.loadBitmap(doc))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 15, clientY: 15 })
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 15, clientY: 15 })
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
    const pixel = (x: number, y: number) => Array.from(image.data.slice((y * 30 + x) * 4, (y * 30 + x) * 4 + 4))
    expect(pixel(10, 10)).toEqual([0, 0, 0, 255])
    expect(pixel(5, 5)).toEqual([255, 255, 255, 255])
  })

  it('scales a selection from its corner handle', () => {
    const { ref, canvas } = setup('select', 30, 30)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 25, clientY: 25 })
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 25, clientY: 25 })
    expect(ref.current?.getSelection()).toEqual({ x: 2, y: 2, width: 23, height: 23 })
  })

  it('supports transparent selection mode', () => {
    const { ref, canvas } = setup('select', 30, 30, true)
    const context = { putImageData: vi.fn() }
    canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
    const doc = new Bitmap(30, 30, WHITE)
    doc.set(5, 5, BLACK)
    doc.set(21, 21, { r: 255, g: 0, b: 0, a: 255 })
    act(() => ref.current?.loadBitmap(doc))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 15, clientY: 15 })
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 15, clientY: 15 })
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
    const pixel = (x: number, y: number) => Array.from(image.data.slice((y * 30 + x) * 4, (y * 30 + x) * 4 + 4))
    expect(ref.current?.getSelection()).toEqual({ x: 7, y: 7, width: 18, height: 18 })
    expect(pixel(10, 10)).toEqual([0, 0, 0, 255])
    expect(pixel(21, 21)).toEqual([255, 0, 0, 255])
  })

  it('bakes a moved selection for undo and redo', () => {
    const { ref, canvas } = setup('select', 30, 30)
    const context = { putImageData: vi.fn() }
    canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
    const doc = new Bitmap(30, 30, WHITE)
    doc.set(5, 5, BLACK)
    act(() => ref.current?.loadBitmap(doc))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 15, clientY: 15 })
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 15, clientY: 15 })
    act(() => ref.current?.undo())
    act(() => ref.current?.redo())
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
    const pixel = (x: number, y: number) => Array.from(image.data.slice((y * 30 + x) * 4, (y * 30 + x) * 4 + 4))
    expect(pixel(10, 10)).toEqual([0, 0, 0, 255])
    expect(pixel(5, 5)).toEqual([255, 255, 255, 255])
  })

  it('selects everything', () => {
    const { ref, onSelectionChange } = setup('select', 12, 9)
    act(() => ref.current?.selectAll())
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: 12, height: 9 })
    expect(onSelectionChange).toHaveBeenLastCalledWith(true)
  })

  it('inverts a rectangular selection', () => {
    const { ref, canvas } = setup('select', 10, 10)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 4, clientY: 9 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 4, clientY: 9 })
    act(() => ref.current?.invertSelection())
    expect(ref.current?.getSelection()).toEqual({ x: 5, y: 0, width: 5, height: 10 })
  })

  it('clears the selected pixels with the secondary colour', () => {
    const { ref, canvas, onHistoryChange } = setup('select', 10, 10)
    const context = { putImageData: vi.fn() }
    canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
    act(() => ref.current?.loadBitmap(new Bitmap(10, 10, BLACK)))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 5, clientY: 5 })
    act(() => ref.current?.deleteSelection())
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
    const pixel = (x: number, y: number) => Array.from(image.data.slice((y * 10 + x) * 4, (y * 10 + x) * 4 + 4))
    expect(pixel(3, 3)).toEqual([255, 255, 255, 255])
    expect(pixel(8, 8)).toEqual([0, 0, 0, 255])
    expect(ref.current?.getSelection()).toBeNull()
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('makes a free-form selection and only clears inside the outline', () => {
    const { ref, canvas } = setup('select', 10, 10, false, 'freeform')
    const context = { putImageData: vi.fn() }
    canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
    act(() => ref.current?.loadBitmap(new Bitmap(10, 10, BLACK)))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 8, clientY: 0 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 0, clientY: 8 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 0, clientY: 8 })
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: 7, height: 7 })
    act(() => ref.current?.deleteSelection())
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
    const pixel = (x: number, y: number) => Array.from(image.data.slice((y * 10 + x) * 4, (y * 10 + x) * 4 + 4))
    expect(pixel(1, 1)).toEqual([255, 255, 255, 255])
    expect(pixel(6, 6)).toEqual([0, 0, 0, 255])
  })

  it('moves only the free-form pixels', () => {
    const red = { r: 255, g: 0, b: 0, a: 255 }
    const blue = { r: 0, g: 0, b: 255, a: 255 }
    const { ref, canvas } = setup('select', 40, 40, false, 'freeform')
    const context = { putImageData: vi.fn() }
    canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
    const doc = new Bitmap(40, 40, red)
    doc.set(18, 18, blue)
    act(() => ref.current?.loadBitmap(doc))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 20, clientY: 0 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 0, clientY: 20 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 0, clientY: 20 })
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: 19, height: 19 })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 5, clientY: 5 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 15, clientY: 15 })
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 15, clientY: 15 })
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
    const pixel = (x: number, y: number) => Array.from(image.data.slice((y * 40 + x) * 4, (y * 40 + x) * 4 + 4))
    expect(ref.current?.getSelection()).toEqual({ x: 10, y: 10, width: 19, height: 19 })
    expect(pixel(1, 1)).toEqual([255, 255, 255, 255])
    expect(pixel(12, 12)).toEqual([255, 0, 0, 255])
    expect(pixel(28, 28)).toEqual([255, 0, 0, 255])
  })
})
