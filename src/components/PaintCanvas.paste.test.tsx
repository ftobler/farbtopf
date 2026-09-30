import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import type { Rgba } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }

interface Box {
  left: number
  top: number
  width: number
  height: number
}

function domRect({ left, top, width, height }: Box): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

function setup(
  width = 30,
  height = 30,
  options: { transparentSelection?: boolean; workspace?: Box; canvasAt?: { left: number; top: number } } = {},
) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const onSizeChange = vi.fn()
  const onSelectionChange = vi.fn()
  const workspace = document.createElement('div')
  workspace.className = 'workspace'
  document.body.appendChild(workspace)
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={width}
      initialHeight={height}
      tool="select"
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={onSizeChange}
      onSelectionChange={onSelectionChange}
      transparentSelection={options.transparentSelection ?? false}
      selectionShape="rectangle"
    />,
    { container: workspace },
  )
  const canvas = container.querySelector('canvas') as HTMLCanvasElement
  const at = options.canvasAt ?? { left: 0, top: 0 }
  // The canvas is shown at 1:1, so its on-screen box always matches the document size.
  canvas.getBoundingClientRect = () => {
    const current = ref.current?.getSize() ?? { width, height }
    return domRect({ left: at.left, top: at.top, width: current.width, height: current.height })
  }
  if (options.workspace) {
    const box = options.workspace
    workspace.getBoundingClientRect = () => domRect(box)
  }
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  const shown = () => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
    return (x: number, y: number) =>
      Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4))
  }
  return { ref, canvas, onHistoryChange, onSizeChange, onSelectionChange, shown }
}

describe('PaintCanvas paste', () => {
  it('keeps the canvas size when the pasted image fits', () => {
    const { ref, onSizeChange } = setup(30, 30)
    onSizeChange.mockClear()
    act(() => ref.current?.pasteBitmap(new Bitmap(10, 8, RED)))
    expect(ref.current?.getSize()).toEqual({ width: 30, height: 30 })
    expect(onSizeChange).not.toHaveBeenCalled()
  })

  it('enlarges only the dimension the pasted image does not fit in', () => {
    const { ref, onSizeChange } = setup(30, 30)
    act(() => ref.current?.pasteBitmap(new Bitmap(40, 10, RED)))
    expect(ref.current?.getSize()).toEqual({ width: 40, height: 30 })
    expect(onSizeChange).toHaveBeenLastCalledWith(40, 30)
  })

  it('enlarges both dimensions just enough when the pasted image is bigger in both', () => {
    const { ref } = setup(30, 20)
    act(() => ref.current?.pasteBitmap(new Bitmap(35, 45, RED)))
    expect(ref.current?.getSize()).toEqual({ width: 35, height: 45 })
  })

  it('fills the new area with white on the bottom layer', () => {
    const { ref, shown } = setup(20, 20)
    const doc = new Bitmap(20, 20, WHITE)
    doc.set(0, 0, BLACK)
    act(() => ref.current?.loadBitmap(doc))
    act(() => ref.current?.pasteBitmap(new Bitmap(30, 5, RED)))
    act(() => ref.current?.clearSelection())
    const pixel = shown()
    expect(pixel(0, 0)).toEqual([255, 0, 0, 255])
    expect(pixel(25, 2)).toEqual([255, 0, 0, 255])
    // Below the paste, the enlarged strip is white.
    expect(pixel(25, 10)).toEqual([255, 255, 255, 255])
  })

  it('makes the pasted image a floating selection at the top-left of the image', () => {
    const { ref, onSelectionChange } = setup(30, 30)
    act(() => ref.current?.pasteBitmap(new Bitmap(10, 8, RED)))
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: 10, height: 8 })
    expect(onSelectionChange).toHaveBeenLastCalledWith(true)
  })

  it('places the paste at the top-left of the visible part of the image', () => {
    // The image is scrolled so that its pixel (12, 7) sits at the workspace's corner.
    const { ref } = setup(60, 60, {
      workspace: { left: 100, top: 50, width: 30, height: 30 },
      canvasAt: { left: 88, top: 43 },
    })
    act(() => ref.current?.pasteBitmap(new Bitmap(10, 8, RED)))
    expect(ref.current?.getSelection()).toEqual({ x: 12, y: 7, width: 10, height: 8 })
  })

  it('keeps a paste placed at the visible corner inside the image', () => {
    const { ref } = setup(30, 30, {
      workspace: { left: 100, top: 50, width: 30, height: 30 },
      canvasAt: { left: 75, top: 30 },
    })
    act(() => ref.current?.pasteBitmap(new Bitmap(10, 8, RED)))
    expect(ref.current?.getSelection()).toEqual({ x: 20, y: 20, width: 10, height: 8 })
  })

  it('shows the pasted pixels and leaves the image below untouched until it is placed', () => {
    const { ref, shown } = setup(30, 30)
    act(() => ref.current?.pasteBitmap(new Bitmap(10, 8, RED)))
    const pixel = shown()
    expect(pixel(0, 0)).toEqual([255, 0, 0, 255])
    expect(pixel(9, 7)).toEqual([255, 0, 0, 255])
    expect(pixel(10, 8)).toEqual([255, 255, 255, 255])
  })

  it('moves the pasted image when dragged, without leaving a hole behind', () => {
    const { ref, canvas, shown } = setup(30, 30)
    act(() => ref.current?.pasteBitmap(new Bitmap(12, 12, RED)))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 6, clientY: 6 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 16, clientY: 21 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 16, clientY: 21 })
    expect(ref.current?.getSelection()).toEqual({ x: 10, y: 15, width: 12, height: 12 })
    const pixel = shown()
    expect(pixel(10, 15)).toEqual([255, 0, 0, 255])
    expect(pixel(0, 0)).toEqual([255, 255, 255, 255])
  })

  it('stamps the pasted image into the layer when clicking elsewhere', () => {
    const { ref, canvas, shown } = setup(30, 30)
    act(() => ref.current?.pasteBitmap(new Bitmap(12, 12, RED)))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 6, clientY: 6 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 16, clientY: 21 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 16, clientY: 21 })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 28, clientY: 2 })
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 28, clientY: 2 })
    expect(ref.current?.getSelection()).toBeNull()
    const pixel = shown()
    expect(pixel(10, 15)).toEqual([255, 0, 0, 255])
    expect(pixel(21, 26)).toEqual([255, 0, 0, 255])
    expect(pixel(0, 0)).toEqual([255, 255, 255, 255])
  })

  it('can be flipped and scaled like any floating selection', () => {
    const { ref, shown } = setup(30, 30)
    const pasted = new Bitmap(4, 2, WHITE)
    pasted.set(0, 0, RED)
    act(() => ref.current?.pasteBitmap(pasted))
    act(() => ref.current?.flip('horizontal'))
    act(() => ref.current?.scale(8, 4))
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: 8, height: 4 })
    act(() => ref.current?.clearSelection())
    const pixel = shown()
    expect(pixel(7, 0)).toEqual([255, 0, 0, 255])
    expect(pixel(0, 0)).toEqual([255, 255, 255, 255])
  })

  it('makes secondary-coloured pixels see-through in transparent selection mode', () => {
    const { ref, shown } = setup(30, 30, { transparentSelection: true })
    const doc = new Bitmap(30, 30, BLACK)
    act(() => ref.current?.loadBitmap(doc))
    const pasted = new Bitmap(4, 4, WHITE)
    pasted.set(0, 0, RED)
    act(() => ref.current?.pasteBitmap(pasted))
    act(() => ref.current?.clearSelection())
    const pixel = shown()
    expect(pixel(0, 0)).toEqual([255, 0, 0, 255])
    expect(pixel(1, 1)).toEqual([0, 0, 0, 255])
  })

  it('undoes the paste in one step', () => {
    const { ref, canvas, shown, onHistoryChange } = setup(30, 30)
    act(() => ref.current?.pasteBitmap(new Bitmap(12, 12, RED)))
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 6, clientY: 6 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 16, clientY: 21 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 16, clientY: 21 })
    act(() => ref.current?.undo())
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
    expect(ref.current?.getSelection()).toBeNull()
    const pixel = shown()
    expect(pixel(10, 15)).toEqual([255, 255, 255, 255])
    expect(pixel(0, 0)).toEqual([255, 255, 255, 255])
  })

  it('restores the original canvas size when undoing a paste that enlarged it', () => {
    const { ref, onSizeChange } = setup(30, 30)
    act(() => ref.current?.pasteBitmap(new Bitmap(40, 50, RED)))
    expect(ref.current?.getSize()).toEqual({ width: 40, height: 50 })
    act(() => ref.current?.undo())
    expect(ref.current?.getSize()).toEqual({ width: 30, height: 30 })
    expect(onSizeChange).toHaveBeenLastCalledWith(30, 30)
    act(() => ref.current?.redo())
    expect(ref.current?.getSize()).toEqual({ width: 40, height: 50 })
  })

  it('stamps a previous floating selection before pasting another', () => {
    const { ref, shown } = setup(30, 30)
    act(() => ref.current?.pasteBitmap(new Bitmap(10, 8, RED)))
    act(() => ref.current?.pasteBitmap(new Bitmap(2, 2, BLACK)))
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: 2, height: 2 })
    act(() => ref.current?.clearSelection())
    const pixel = shown()
    expect(pixel(0, 0)).toEqual([0, 0, 0, 255])
    expect(pixel(5, 5)).toEqual([255, 0, 0, 255])
  })
})
