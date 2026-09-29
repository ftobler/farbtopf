import { createRef } from 'react'
import { act, render, within } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import type { BrushId } from '../core/brushes'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

vi.mock('../core/shapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/shapes')>()
  return { ...actual, renderShape: vi.fn(actual.renderShape) }
})
import { renderShape } from '../core/shapes'
import type { ShapeKind } from '../core/shapes'

type SetupTool = 'brush' | 'shape' | 'select' | 'zoom' | 'text' | 'picker'

function setup(
  tool: SetupTool,
  width = 20,
  height = 20,
  transparentSelection = false,
  selectionShape: 'rectangle' | 'freeform' = 'rectangle',
  shapeKind: ShapeKind = 'rectangle',
  brush: BrushId = 'round',
  brushSize = 1,
) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const onCursorMove = vi.fn()
  const onPickColor = vi.fn()
  const onSizeChange = vi.fn()
  const onSelectionChange = vi.fn()
  const onZoomClick = vi.fn()
  const onTextChange = vi.fn()

  const element = (props: { tool: SetupTool; shapeKind: ShapeKind; brush: BrushId; brushSize: number }) => (
    <PaintCanvas
      ref={ref}
      initialWidth={width}
      initialHeight={height}
      tool={props.tool}
      primary={BLACK}
      secondary={WHITE}
      brushSize={props.brushSize}
      shapeFill="outline"
      shapeKind={props.shapeKind}
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={onCursorMove}
      onPickColor={onPickColor}
      onSizeChange={onSizeChange}
      onSelectionChange={onSelectionChange}
      onZoomClick={onZoomClick}
      transparentSelection={transparentSelection}
      selectionShape={selectionShape}
      brush={props.brush}
      onTextChange={onTextChange}
    />
  )
  const { container, rerender } = render(element({ tool, shapeKind, brush, brushSize }))
  const setProps = (props: { tool?: SetupTool; shapeKind?: ShapeKind; brush?: BrushId; brushSize?: number }) =>
    rerender(
      element({
        tool: props.tool ?? tool,
        shapeKind: props.shapeKind ?? shapeKind,
        brush: props.brush ?? brush,
        brushSize: props.brushSize ?? brushSize,
      }),
    )

  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  return { ref, canvas, container, setProps, onHistoryChange, onPickColor, onSizeChange, onSelectionChange, onZoomClick, onTextChange }
}

describe('PaintCanvas', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('zooms in on left click and ignores a right click with the zoom tool', () => {
    const { canvas, onZoomClick, onHistoryChange } = setup('zoom')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    expect(onZoomClick).toHaveBeenLastCalledWith(1)
    fireEvent.pointerDown(canvas, { button: 2, pointerId: 2, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(canvas, { button: 2, pointerId: 2, clientX: 5, clientY: 5 })
    expect(onZoomClick).toHaveBeenCalledTimes(1)
    expect(onHistoryChange).not.toHaveBeenCalledWith(true, false)
  })

  it('never acts on a right click: no paint, no pick, no zoom', () => {
    const { canvas, onZoomClick } = setup('brush', 20, 20)
    const context = { putImageData: vi.fn() }
    canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
    context.putImageData.mockClear()
    fireEvent.pointerDown(canvas, { button: 2, pointerId: 3, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(canvas, { button: 2, pointerId: 3, clientX: 5, clientY: 5 })
    expect(context.putImageData).not.toHaveBeenCalled()
    expect(onZoomClick).not.toHaveBeenCalled()

    const picker = setup('picker', 20, 20)
    fireEvent.pointerDown(picker.canvas, { button: 2, pointerId: 4, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(picker.canvas, { button: 2, pointerId: 4, clientX: 5, clientY: 5 })
    expect(picker.onPickColor).not.toHaveBeenCalled()
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
    const { ref, canvas, onHistoryChange } = setup('shape')
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

  it('scales the canvas backing store with the device pixel ratio', () => {
    const original = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    try {
      const { ref, canvas } = setup('brush', 20, 20)
      const context = { putImageData: vi.fn() }
      canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
      act(() => ref.current?.newDocument(20, 20))
      expect(canvas.width).toBe(40)
      expect(canvas.height).toBe(40)
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true })
    }
  })

  it('keeps the backing store at bitmap size on a fractional device pixel ratio', () => {
    const original = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', { value: 1.25, configurable: true })
    try {
      const { ref, canvas } = setup('brush', 20, 20)
      const context = { putImageData: vi.fn() }
      canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
      act(() => ref.current?.newDocument(20, 20))
      expect(canvas.width).toBe(20)
      expect(canvas.height).toBe(20)
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true })
    }
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

  it('keeps a full-canvas selection full when dragged by its corner handle', () => {
    const { ref, canvas } = setup('select', 30, 30)
    act(() => ref.current?.selectAll())
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 30, clientY: 30 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 30 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 30, clientY: 30 })
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: 30, height: 30 })
  })

  it('drops the selection when the document is scaled', () => {
    const { ref } = setup('select', 30, 30)
    act(() => ref.current?.selectAll())
    expect(ref.current?.getSelection()).not.toBeNull()
    act(() => ref.current?.resize(15, 15))
    expect(ref.current?.getSelection()).toBeNull()
  })

  it('drops the selection when the canvas is cleared', () => {
    const { ref } = setup('select', 30, 30)
    act(() => ref.current?.selectAll())
    expect(ref.current?.getSelection()).not.toBeNull()
    act(() => ref.current?.clear())
    expect(ref.current?.getSelection()).toBeNull()
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

  describe('rotating and flipping a selection', () => {
    const red = { r: 255, g: 0, b: 0, a: 255 }

    function selectBar(canvas: HTMLCanvasElement) {
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 13 })
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 19, clientY: 16 })
      fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 19, clientY: 16 })
    }

    function spyPixels(canvas: HTMLCanvasElement, width: number) {
      const context = { putImageData: vi.fn() }
      canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
      return (x: number, y: number) => {
        const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
        return Array.from(image.data.slice((y * width + x) * 4, (y * width + x) * 4 + 4))
      }
    }

    function dragRotate(container: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) {
      const handle = container.querySelector('.selection-rotate-handle')
      if (!handle) throw new Error('rotate handle not rendered')
      handle.setPointerCapture = vi.fn()
      fireEvent.pointerDown(handle, { button: 0, pointerId: 5, clientX: from.x, clientY: from.y })
      fireEvent.pointerMove(handle, { pointerId: 5, clientX: to.x, clientY: to.y })
      fireEvent.pointerUp(handle, { pointerId: 5, clientX: to.x, clientY: to.y })
    }

    it('renders a rotate handle only while there is a selection', () => {
      const { canvas, container } = setup('select', 40, 40)
      expect(container.querySelector('.selection-rotate-handle')).toBeNull()
      selectBar(canvas)
      expect(container.querySelector('.selection-rotate-handle')).not.toBeNull()
    })

    it('rotates the selection a quarter turn about its centre when the handle is dragged', () => {
      const { ref, canvas, container } = setup('select', 40, 40)
      const pixel = spyPixels(canvas, 40)
      const doc = new Bitmap(40, 40, WHITE)
      doc.set(10, 13, BLACK)
      act(() => ref.current?.loadBitmap(doc))
      selectBar(canvas)
      expect(ref.current?.getSelection()).toEqual({ x: 10, y: 13, width: 10, height: 4 })
      dragRotate(container, { x: 15, y: 5 }, { x: 25, y: 15 })
      expect(ref.current?.getSelection()).toEqual({ x: 13, y: 10, width: 4, height: 10 })
      expect(pixel(16, 10)).toEqual([0, 0, 0, 255])
      expect(pixel(10, 13)).toEqual([255, 255, 255, 255])
    })

    it('follows the pointer angle without snapping', () => {
      const { ref, canvas, container } = setup('select', 40, 40)
      selectBar(canvas)
      const radians = (30 * Math.PI) / 180
      dragRotate(container, { x: 15, y: 5 }, { x: 15 + 10 * Math.sin(radians), y: 15 - 10 * Math.cos(radians) })
      const rotated = ref.current?.getSelection()
      expect(rotated?.width).toBe(11)
      expect(rotated?.height).toBe(9)
    })

    it('applies small angles too', () => {
      const { ref, canvas, container } = setup('select', 40, 40)
      selectBar(canvas)
      const radians = (5 * Math.PI) / 180
      dragRotate(container, { x: 15, y: 5 }, { x: 15 + 10 * Math.sin(radians), y: 15 - 10 * Math.cos(radians) })
      const rotated = ref.current?.getSelection()
      expect(rotated?.width).toBe(11)
      expect(rotated?.height).toBe(5)
    })

    it('keeps the pixels under the transparent corners of a rotated selection', () => {
      const { ref, canvas } = setup('select', 40, 40)
      const pixel = spyPixels(canvas, 40)
      act(() => ref.current?.loadBitmap(new Bitmap(40, 40, red)))
      selectBar(canvas)
      act(() => ref.current?.rotate(30))
      expect(ref.current?.getSelection()).toEqual({ x: 10, y: 11, width: 11, height: 9 })
      expect(pixel(10, 11)).toEqual([255, 0, 0, 255])
      expect(ref.current?.getSize()).toEqual({ width: 40, height: 40 })
    })

    it('flips only the selected pixels', () => {
      const { ref, canvas } = setup('select', 20, 20)
      const pixel = spyPixels(canvas, 20)
      const doc = new Bitmap(20, 20, WHITE)
      doc.set(2, 2, BLACK)
      doc.set(15, 15, BLACK)
      act(() => ref.current?.loadBitmap(doc))
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 5, clientY: 5 })
      fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 5, clientY: 5 })
      act(() => ref.current?.flip('horizontal'))
      expect(pixel(5, 2)).toEqual([0, 0, 0, 255])
      expect(pixel(2, 2)).toEqual([255, 255, 255, 255])
      expect(pixel(15, 15)).toEqual([0, 0, 0, 255])
      expect(pixel(4, 15)).toEqual([255, 255, 255, 255])
      expect(ref.current?.getSelection()).toEqual({ x: 2, y: 2, width: 4, height: 4 })
    })

    it('flips the whole image without a selection', () => {
      const { ref, canvas } = setup('brush', 20, 20)
      const pixel = spyPixels(canvas, 20)
      const doc = new Bitmap(20, 20, WHITE)
      doc.set(0, 0, BLACK)
      act(() => ref.current?.loadBitmap(doc))
      act(() => ref.current?.flip('horizontal'))
      expect(pixel(19, 0)).toEqual([0, 0, 0, 255])
      expect(pixel(0, 0)).toEqual([255, 255, 255, 255])
    })

    it('flips a free-form mask along with the pixels', () => {
      const { ref, canvas } = setup('select', 10, 10, false, 'freeform')
      const pixel = spyPixels(canvas, 10)
      act(() => ref.current?.loadBitmap(new Bitmap(10, 10, BLACK)))
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 8, clientY: 0 })
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 0, clientY: 8 })
      fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 0, clientY: 8 })
      act(() => ref.current?.flip('horizontal'))
      act(() => ref.current?.cutSelection())
      expect(pixel(6, 6)).toEqual([255, 255, 255, 255])
      expect(pixel(2, 6)).toEqual([0, 0, 0, 255])
    })

    it('rotates only the selection by a quarter turn', () => {
      const { ref, canvas, onSizeChange } = setup('select', 40, 40)
      const pixel = spyPixels(canvas, 40)
      const doc = new Bitmap(40, 40, WHITE)
      doc.set(10, 13, BLACK)
      act(() => ref.current?.loadBitmap(doc))
      selectBar(canvas)
      onSizeChange.mockClear()
      act(() => ref.current?.rotate(90))
      expect(ref.current?.getSelection()).toEqual({ x: 13, y: 10, width: 4, height: 10 })
      expect(ref.current?.getSize()).toEqual({ width: 40, height: 40 })
      expect(onSizeChange).not.toHaveBeenCalled()
      expect(pixel(16, 10)).toEqual([0, 0, 0, 255])
      expect(pixel(10, 13)).toEqual([255, 255, 255, 255])
    })

    it('rotates the whole canvas without a selection', () => {
      const { ref, onSizeChange } = setup('select', 20, 10)
      act(() => ref.current?.rotate(90))
      expect(ref.current?.getSize()).toEqual({ width: 10, height: 20 })
      expect(onSizeChange).toHaveBeenLastCalledWith(10, 20)
    })

    it('scales the rotated result with the resize handles', () => {
      const { ref, canvas, container } = setup('select', 40, 40)
      selectBar(canvas)
      dragRotate(container, { x: 15, y: 5 }, { x: 25, y: 15 })
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 17, clientY: 20 })
      fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 21, clientY: 20 })
      fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 21, clientY: 20 })
      expect(ref.current?.getSelection()).toEqual({ x: 13, y: 10, width: 8, height: 10 })
    })

    it('moves a rotated selection that sticks out of the canvas', () => {
      const { ref, canvas } = setup('select', 20, 20)
      act(() => ref.current?.selectAll())
      act(() => ref.current?.rotate(45))
      const rotated = ref.current?.getSelection()
      expect(rotated?.x).toBeLessThan(0)
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 12, clientY: 11 })
      fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 12, clientY: 11 })
      expect(ref.current?.getSelection()).toEqual({ ...rotated, x: (rotated?.x ?? 0) + 2, y: (rotated?.y ?? 0) + 1 })
    })
  })

  describe('freehand and polyline shapes', () => {
    const black = [0, 0, 0, 255]
    const white = [255, 255, 255, 255]

    function spyPixels(canvas: HTMLCanvasElement, width: number) {
      const context = { putImageData: vi.fn() }
      canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
      return (x: number, y: number) => {
        const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
        return Array.from(image.data.slice((y * width + x) * 4, (y * width + x) * 4 + 4))
      }
    }

    function down(canvas: HTMLCanvasElement, pointerId: number, x: number, y: number) {
      fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId, clientX: x, clientY: y })
    }

    function move(canvas: HTMLCanvasElement, pointerId: number, x: number, y: number, buttons = 1) {
      fireEvent.pointerMove(canvas, { buttons, pointerId, clientX: x, clientY: y })
    }

    function up(canvas: HTMLCanvasElement, pointerId: number, x: number, y: number) {
      fireEvent.pointerUp(canvas, { button: 0, pointerId, clientX: x, clientY: y })
    }

    function click(canvas: HTMLCanvasElement, pointerId: number, x: number, y: number) {
      down(canvas, pointerId, x, y)
      up(canvas, pointerId, x, y)
    }

    function dragFirstSegment(canvas: HTMLCanvasElement) {
      down(canvas, 1, 2, 2)
      move(canvas, 1, 12, 2)
      up(canvas, 1, 12, 2)
    }

    it('draws a freeform shape through every dragged point as one undo step', () => {
      const { ref, canvas, onHistoryChange } = setup('shape', 20, 20, false, 'rectangle', 'freeform')
      const pixel = spyPixels(canvas, 20)
      onHistoryChange.mockClear()
      vi.mocked(renderShape).mockClear()
      down(canvas, 1, 2, 2)
      move(canvas, 1, 12, 2)
      move(canvas, 1, 12, 12)
      up(canvas, 1, 12, 12)
      expect(vi.mocked(renderShape).mock.lastCall?.slice(1, 3)).toEqual([
        'freeform',
        [{ x: 2, y: 2 }, { x: 12, y: 2 }, { x: 12, y: 12 }],
      ])
      expect(pixel(7, 2)).toEqual(black)
      expect(pixel(12, 7)).toEqual(black)
      expect(pixel(7, 7)).toEqual(black)
      expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
      act(() => ref.current?.undo())
      expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
      expect(pixel(7, 2)).toEqual(white)
    })

    it('leaves no history for a freeform click without a drag', () => {
      const { canvas, onHistoryChange } = setup('shape', 20, 20, false, 'rectangle', 'freeform')
      onHistoryChange.mockClear()
      click(canvas, 1, 5, 5)
      expect(onHistoryChange).not.toHaveBeenCalled()
    })

    it('adds polyline vertices on click and finishes with Enter as one undo step', () => {
      const { ref, canvas, onHistoryChange } = setup('shape', 20, 20, false, 'rectangle', 'polyline')
      const pixel = spyPixels(canvas, 20)
      onHistoryChange.mockClear()
      dragFirstSegment(canvas)
      click(canvas, 2, 12, 12)
      expect(onHistoryChange).not.toHaveBeenCalled()
      fireEvent.keyDown(window, { key: 'Enter' })
      expect(pixel(7, 2)).toEqual(black)
      expect(pixel(12, 7)).toEqual(black)
      expect(pixel(7, 7)).toEqual(white)
      expect(onHistoryChange).toHaveBeenCalledTimes(1)
      expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
      act(() => ref.current?.undo())
      expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
      expect(pixel(7, 2)).toEqual(white)
      expect(pixel(12, 7)).toEqual(white)
    })

    it('finishes a polyline on double-click', () => {
      const { canvas, onHistoryChange } = setup('shape', 20, 20, false, 'rectangle', 'polyline')
      const pixel = spyPixels(canvas, 20)
      onHistoryChange.mockClear()
      dragFirstSegment(canvas)
      click(canvas, 2, 12, 12)
      click(canvas, 3, 12, 12)
      expect(pixel(12, 7)).toEqual(black)
      expect(onHistoryChange).toHaveBeenCalledTimes(1)
      click(canvas, 4, 2, 12)
      expect(pixel(7, 12)).toEqual(white)
      expect(onHistoryChange).toHaveBeenCalledTimes(1)
    })

    it('finishes a polyline on Escape, keeping what was drawn', () => {
      const { canvas, onHistoryChange } = setup('shape', 20, 20, false, 'rectangle', 'polyline')
      const pixel = spyPixels(canvas, 20)
      onHistoryChange.mockClear()
      dragFirstSegment(canvas)
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(pixel(7, 2)).toEqual(black)
      expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    })

    it('previews the next segment while hovering but leaves it out when finished', () => {
      const { canvas } = setup('shape', 20, 20, false, 'rectangle', 'polyline')
      const pixel = spyPixels(canvas, 20)
      dragFirstSegment(canvas)
      move(canvas, 1, 12, 12, 0)
      expect(pixel(12, 7)).toEqual(black)
      fireEvent.keyDown(window, { key: 'Enter' })
      expect(pixel(7, 2)).toEqual(black)
      expect(pixel(12, 7)).toEqual(white)
    })

    it('ignores Enter typed into another text field', () => {
      const { canvas, onHistoryChange } = setup('shape', 20, 20, false, 'rectangle', 'polyline')
      onHistoryChange.mockClear()
      dragFirstSegment(canvas)
      const input = document.createElement('textarea')
      document.body.appendChild(input)
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onHistoryChange).not.toHaveBeenCalled()
      input.remove()
    })

    it('commits an unfinished polyline when the tool changes', () => {
      const { canvas, setProps, onHistoryChange } = setup('shape', 20, 20, false, 'rectangle', 'polyline')
      const pixel = spyPixels(canvas, 20)
      onHistoryChange.mockClear()
      dragFirstSegment(canvas)
      click(canvas, 2, 12, 12)
      setProps({ tool: 'brush' })
      expect(pixel(7, 2)).toEqual(black)
      expect(pixel(12, 7)).toEqual(black)
      expect(onHistoryChange).toHaveBeenCalledTimes(1)
      expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    })

    it('commits an unfinished polyline with its own kind when the shape kind changes', () => {
      const { canvas, setProps, onHistoryChange } = setup('shape', 20, 20, false, 'rectangle', 'polyline')
      const pixel = spyPixels(canvas, 20)
      onHistoryChange.mockClear()
      dragFirstSegment(canvas)
      click(canvas, 2, 12, 12)
      setProps({ shapeKind: 'line' })
      expect(pixel(12, 7)).toEqual(black)
      expect(pixel(7, 7)).toEqual(white)
      expect(onHistoryChange).toHaveBeenCalledTimes(1)
    })

    it('commits an unfinished polyline before undoing', () => {
      const { ref, canvas, onHistoryChange } = setup('shape', 20, 20, false, 'rectangle', 'polyline')
      const pixel = spyPixels(canvas, 20)
      dragFirstSegment(canvas)
      act(() => ref.current?.undo())
      expect(pixel(7, 2)).toEqual(white)
      expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
      act(() => ref.current?.redo())
      expect(pixel(7, 2)).toEqual(black)
    })

    it('drops a polyline that never got a second vertex', () => {
      const { canvas, onHistoryChange } = setup('shape', 20, 20, false, 'rectangle', 'polyline')
      onHistoryChange.mockClear()
      click(canvas, 1, 5, 5)
      fireEvent.keyDown(window, { key: 'Enter' })
      expect(onHistoryChange).not.toHaveBeenCalled()
    })
  })

  describe('brush engine', () => {
    function spyPixels(canvas: HTMLCanvasElement, width: number) {
      const context = { putImageData: vi.fn() }
      canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
      return (x: number, y: number) => {
        const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
        return Array.from(image.data.slice((y * width + x) * 4, (y * width + x) * 4 + 4))
      }
    }

    it('paints a contiguous round stroke across several pointer moves', () => {
      const { canvas } = setup('brush', 20, 20, false, 'rectangle', 'rectangle', 'round', 5)
      const pixel = spyPixels(canvas, 20)
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 10 })
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 7, clientY: 10 })
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 13, clientY: 10 })
      fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 13, clientY: 10 })
      for (let x = 2; x <= 13; x += 1) {
        expect(pixel(x, 10), `gap at x=${x}`).not.toEqual([255, 255, 255, 255])
      }
    })

    it('paints with the soft brush at size 2', () => {
      const { canvas } = setup('brush', 20, 20, false, 'rectangle', 'rectangle', 'soft', 2)
      const pixel = spyPixels(canvas, 20)
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
      fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 5, clientY: 5 })
      expect(pixel(5, 5)).not.toEqual([255, 255, 255, 255])
    })

    it('keeps a highlighter stroke at one uniform alpha where segments overlap', () => {
      const { canvas, onHistoryChange } = setup('brush', 20, 20, false, 'rectangle', 'rectangle', 'highlighter', 12)
      const pixel = spyPixels(canvas, 20)
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 10 })
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 8, clientY: 10 })
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 14, clientY: 10 })
      fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 14, clientY: 10 })
      const painted = pixel(5, 10)
      expect(painted).not.toEqual([255, 255, 255, 255])
      // A pixel overlapped by several dabs keeps the same colour as one dab.
      expect(pixel(12, 10)).toEqual(painted)
      expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    })
  })

  describe('text tool', () => {
    function openEditor(canvas: HTMLCanvasElement, x = 10, y = 10) {
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: x, clientY: y })
    }

    function fullGesture(element: Element) {
      fireEvent.pointerDown(element, { button: 0, pointerId: 9 })
      fireEvent.mouseDown(element, { button: 0 })
    }

    async function flushOutsideListener() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }

    it('opens a resizable text box with eight handles and a formatting toolbar', () => {
      const { canvas, container } = setup('text', 200, 200)
      expect(container.querySelector('.text-editor')).toBeNull()
      openEditor(canvas)
      expect(container.querySelector('.text-editor')).not.toBeNull()
      expect(container.querySelectorAll('.text-handle')).toHaveLength(8)
      expect(within(container).getByLabelText('Text size')).toBeTruthy()
      expect(within(container).getByRole('button', { name: 'Bold' })).toBeTruthy()
    })

    it('resizes the text box from a handle without stamping it', () => {
      const { canvas, container, onHistoryChange } = setup('text', 200, 200)
      openEditor(canvas)
      const handle = container.querySelector('.text-handle-se') as HTMLElement
      handle.setPointerCapture = vi.fn()
      fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 200, clientY: 44 })
      fireEvent.pointerMove(handle, { pointerId: 2, clientX: 150, clientY: 140 })
      fireEvent.pointerUp(handle, { pointerId: 2, clientX: 150, clientY: 140 })
      const textarea = container.querySelector('.text-editor') as HTMLTextAreaElement
      expect(textarea.style.width).toBe('140px')
      expect(textarea.style.height).toBe('130px')
      expect(onHistoryChange).not.toHaveBeenCalledWith(true, false)
    })

    it('keeps the text editable when formatting changes and commits on a canvas click', () => {
      const { canvas, container, onHistoryChange, onTextChange } = setup('text', 50, 50)
      openEditor(canvas, 5, 5)
      const textarea = container.querySelector('.text-editor') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: 'hi' } })

      const bold = within(container).getByRole('button', { name: 'Bold' })
      fullGesture(bold)
      fireEvent.click(bold)
      expect(onTextChange).toHaveBeenCalledWith({ bold: true })
      expect(container.querySelector('.text-editor')).not.toBeNull()
      expect(onHistoryChange).not.toHaveBeenCalledWith(true, false)

      fireEvent.pointerDown(canvas, { button: 0, pointerId: 3, clientX: 30, clientY: 30 })
      expect(container.querySelector('.text-editor')).toBeNull()
      expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    })

    it('ignores the compatibility mousedown that follows the opening pointerdown', () => {
      const { canvas, container } = setup('text', 50, 50)
      openEditor(canvas, 5, 5)
      fireEvent.mouseDown(canvas, { button: 0 })
      expect(container.querySelector('.text-editor')).not.toBeNull()
    })

    it('keeps the editor open and records no history for gestures on the toolbar, format buttons and font menu', async () => {
      const { canvas, container, onHistoryChange, onTextChange } = setup('text', 200, 200)
      openEditor(canvas, 20, 20)
      await flushOutsideListener()
      onHistoryChange.mockClear()

      fullGesture(within(container).getByLabelText('Text size'))

      const bold = within(container).getByRole('button', { name: 'Bold' })
      fullGesture(bold)
      fireEvent.click(bold)

      const italic = within(container).getByRole('button', { name: 'Italic' })
      fullGesture(italic)
      fireEvent.click(italic)
      expect(onTextChange).toHaveBeenCalledWith({ italic: true })

      const font = within(container).getByRole('button', { name: 'Font' })
      fullGesture(font)
      fireEvent.click(font)
      const georgia = within(container).getByRole('menuitem', { name: 'Georgia' })
      fullGesture(georgia)
      fireEvent.click(georgia)
      expect(onTextChange).toHaveBeenCalledWith({ fontFamily: expect.stringContaining('Georgia') })

      expect(container.querySelector('.text-editor')).not.toBeNull()
      expect(onHistoryChange).not.toHaveBeenCalled()
    })

    it('commits exactly once when the mousedown lands outside the editor', async () => {
      const { canvas, container, onHistoryChange } = setup('text', 50, 50)
      openEditor(canvas, 5, 5)
      const textarea = container.querySelector('.text-editor') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: 'hi' } })
      await flushOutsideListener()
      onHistoryChange.mockClear()

      fireEvent.mouseDown(document.body)

      expect(container.querySelector('.text-editor')).toBeNull()
      expect(onHistoryChange).toHaveBeenCalledTimes(1)
      expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    })

    it('opens the font menu upward when there is no room below', () => {
      const { canvas, container } = setup('text', 200, 200)
      openEditor(canvas, 180, 180)
      fireEvent.click(within(container).getByRole('button', { name: 'Font' }))
      expect(container.querySelector('.dropdown-menu')?.classList.contains('dropdown-up')).toBe(true)
    })
  })

  describe('canvas resize handles', () => {
    function mockFrame(container: HTMLElement, width: number, height: number) {
      const frame = container.querySelector('.canvas-frame') as HTMLElement
      frame.getBoundingClientRect = () =>
        ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }) as DOMRect
      return frame
    }

    function dragHandle(container: HTMLElement, id: string, pointerId: number, x: number, y: number) {
      const element = container.querySelector(`.canvas-resize-handle-${id}`) as HTMLElement
      element.setPointerCapture = vi.fn()
      fireEvent.pointerDown(element, { button: 0, pointerId, clientX: x, clientY: y })
      fireEvent.pointerMove(element, { pointerId, clientX: x, clientY: y })
      fireEvent.pointerUp(element, { pointerId, clientX: x, clientY: y })
      return element
    }

    it('renders eight resize handles around the canvas', () => {
      const { container } = setup('brush')
      expect(container.querySelectorAll('.canvas-resize-handle')).toHaveLength(8)
    })

    it('hides the canvas resize handles while a selection is active', () => {
      const { ref, container } = setup('select', 20, 20)
      expect(container.querySelectorAll('.canvas-resize-handle')).toHaveLength(8)
      act(() => ref.current?.selectAll())
      expect(container.querySelectorAll('.canvas-resize-handle')).toHaveLength(0)
      act(() => ref.current?.clearSelection())
      expect(container.querySelectorAll('.canvas-resize-handle')).toHaveLength(8)
    })

    it('clears the selection after resizeCanvas', () => {
      const { ref, onSelectionChange } = setup('select', 20, 20)
      act(() => ref.current?.selectAll())
      expect(ref.current?.getSelection()).not.toBeNull()
      onSelectionChange.mockClear()
      act(() => ref.current?.resizeCanvas({ x: 0, y: 0, width: 30, height: 30 }))
      expect(ref.current?.getSelection()).toBeNull()
      expect(onSelectionChange).toHaveBeenLastCalledWith(false)
    })

    it('clears a floating selection when resizing the canvas', () => {
      const { ref, canvas } = setup('select', 30, 30)
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
      fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 19, clientY: 19 })
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 15, clientY: 15 })
      fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 15, clientY: 15 })
      expect(ref.current?.getSelection()).not.toBeNull()
      act(() => ref.current?.resizeCanvas({ x: 0, y: 0, width: 40, height: 40 }))
      expect(ref.current?.getSelection()).toBeNull()
    })

    it('resizes the document from a corner handle', () => {
      const { ref, container, onSizeChange } = setup('brush', 20, 20)
      mockFrame(container, 20, 20)
      dragHandle(container, 'se', 9, 30, 25)
      expect(ref.current?.getSize()).toEqual({ width: 30, height: 25 })
      expect(onSizeChange).toHaveBeenLastCalledWith(30, 25)
    })

    it('resizes the document from a side handle without touching the other axis', () => {
      const { ref, container, onSizeChange } = setup('brush', 20, 20)
      mockFrame(container, 20, 20)
      dragHandle(container, 'e', 9, 35, 10)
      expect(ref.current?.getSize()).toEqual({ width: 35, height: 20 })
      expect(onSizeChange).toHaveBeenLastCalledWith(35, 20)
    })

    it('extends the canvas to the left of the original origin', () => {
      const { ref, container } = setup('brush', 20, 20)
      mockFrame(container, 20, 20)
      dragHandle(container, 'nw', 9, -5, -5)
      expect(ref.current?.getSize()).toEqual({ width: 25, height: 25 })
    })

    it('enforces a minimum size of one pixel', () => {
      const { ref, container } = setup('brush', 20, 20)
      mockFrame(container, 20, 20)
      dragHandle(container, 'e', 9, -50, 10)
      expect(ref.current?.getSize()).toEqual({ width: 1, height: 20 })
    })

    it('makes a canvas resize undoable', () => {
      const { ref, container, onHistoryChange } = setup('brush', 20, 20)
      mockFrame(container, 20, 20)
      onHistoryChange.mockClear()
      dragHandle(container, 'se', 9, 40, 40)
      expect(ref.current?.getSize()).toEqual({ width: 40, height: 40 })
      expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
      act(() => ref.current?.undo())
      expect(ref.current?.getSize()).toEqual({ width: 20, height: 20 })
      expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
    })

    it('resizeCanvas extends the canvas keeping content at its image position', () => {
      const { ref, canvas } = setup('brush', 10, 10)
      const context = { putImageData: vi.fn() }
      canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
      const doc = new Bitmap(10, 10, WHITE)
      doc.set(0, 0, BLACK)
      act(() => ref.current?.loadBitmap(doc))
      act(() => ref.current?.resizeCanvas({ x: -2, y: -2, width: 14, height: 14 }))
      expect(ref.current?.getSize()).toEqual({ width: 14, height: 14 })
      const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
      const pixel = (x: number, y: number) => Array.from(image.data.slice((y * 14 + x) * 4, (y * 14 + x) * 4 + 4))
      expect(pixel(0, 0)).toEqual([255, 255, 255, 255])
      expect(pixel(2, 2)).toEqual([0, 0, 0, 255])
    })
  })
})
