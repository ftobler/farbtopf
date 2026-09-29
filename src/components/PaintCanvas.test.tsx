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
  return { ref, canvas, container, onHistoryChange, onSizeChange, onSelectionChange }
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
})
