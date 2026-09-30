import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../core/color'
import type { ToolId } from '../core/tools'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

function setup(tool: ToolId, selectionShape: 'rectangle' | 'freeform' = 'rectangle', width = 30, height = 30) {
  const ref = createRef<PaintCanvasHandle>()
  const onSelectionSizeChange = vi.fn()
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
      onHistoryChange={vi.fn()}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      onSelectionSizeChange={onSelectionSizeChange}
      transparentSelection={false}
      selectionShape={selectionShape}
    />,
  )
  const canvas = container.querySelector('canvas') as HTMLCanvasElement
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const last = () => onSelectionSizeChange.mock.calls.at(-1)?.[0]
  return { ref, canvas, onSelectionSizeChange, last }
}

describe('PaintCanvas selection size', () => {
  it('reports no size while nothing is selected', () => {
    const { last } = setup('select')
    expect(last()).toBeNull()
  })

  it('reports the rectangle size live while it is dragged out', () => {
    const { canvas, last } = setup('select')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 8, clientY: 7 })
    expect(last()).toEqual({ width: 7, height: 6 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 12, clientY: 9 })
    expect(last()).toEqual({ width: 11, height: 8 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 12, clientY: 9 })
    expect(last()).toEqual({ width: 11, height: 8 })
  })

  it('clears the size when the selection is dropped', () => {
    const { canvas, last } = setup('select')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 8, clientY: 7 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 8, clientY: 7 })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 20, clientY: 20 })
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 20, clientY: 20 })
    expect(last()).toBeNull()
  })

  it('reports the bounding box of a free-form selection, also while it is traced', () => {
    const { canvas, last } = setup('select', 'freeform', 10, 10)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 8, clientY: 0 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 0, clientY: 8 })
    expect(last()).toEqual({ width: 9, height: 9 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 0, clientY: 8 })
    expect(last()).toEqual({ width: 7, height: 7 })
  })

  it('follows a floating selection being scaled by its handle and by the scale command', () => {
    const { ref, canvas, last } = setup('select')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 25, clientY: 25 })
    expect(last()).toEqual({ width: 23, height: 23 })
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 25, clientY: 25 })
    act(() => ref.current?.scale(12, 5))
    expect(last()).toEqual({ width: 12, height: 5 })
  })

  it('reports the size of a text box while it is dragged out', () => {
    const { canvas, last } = setup('text', 'rectangle', 200, 200)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 20, clientY: 30 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 120, clientY: 90 })
    expect(last()).toEqual({ width: 101, height: 61 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 120, clientY: 90 })
    expect(last()).toEqual({ width: 101, height: 61 })
  })
})
