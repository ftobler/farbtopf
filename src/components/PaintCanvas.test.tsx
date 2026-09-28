import { createRef } from 'react'
import { act, render } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

function setup(tool: 'brush' | 'rectangle' | 'select', width = 20, height = 20) {
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
})
