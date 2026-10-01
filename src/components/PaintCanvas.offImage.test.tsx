import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const RED = { r: 255, g: 0, b: 0, a: 255 }
const red = [255, 0, 0, 255]
const white = [255, 255, 255, 255]

function setup(width = 20, height = 20, transparentSelection = false) {
  const ref = createRef<PaintCanvasHandle>()
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
      onHistoryChange={vi.fn()}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      onSelectionChange={vi.fn()}
      onZoomClick={vi.fn()}
      transparentSelection={transparentSelection}
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
  /** Presses at `from`, moves through every point of `path` and releases at its end. */
  const drag = (from: [number, number], path: [number, number][], pointerId = 1) => {
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: from[0], clientY: from[1] })
    for (const [x, y] of path) fireEvent.pointerMove(canvas, { pointerId, clientX: x, clientY: y })
    const [x, y] = path.at(-1) ?? from
    fireEvent.pointerUp(canvas, { pointerId, clientX: x, clientY: y })
  }
  /** A white image with a red 10×10 block at (2,2), selected; (7,7) presses its middle. */
  const selectBlock = () => {
    const doc = new Bitmap(width, height, WHITE)
    for (let y = 2; y < 12; y += 1) for (let x = 2; x < 12; x += 1) doc.set(x, y, RED)
    act(() => ref.current?.loadBitmap(doc))
    drag([2, 2], [[11, 11]])
    expect(ref.current?.getSelection()).toEqual({ x: 2, y: 2, width: 10, height: 10 })
  }
  return { ref, canvas, container, pixel, drag, selectBlock }
}

describe('PaintCanvas floating selection beyond the image edge', () => {
  const redBlock = (pixel: (x: number, y: number) => number[], left: number, top: number) => {
    for (let y = top; y < Math.min(20, top + 10); y += 1) {
      for (let x = left; x < Math.min(20, left + 10); x += 1) expect(pixel(x, y)).toEqual(red)
    }
  }

  it('follows the pointer past the right and bottom edges', () => {
    const { ref, drag, selectBlock } = setup()
    selectBlock()
    drag([7, 7], [[20, 20]], 2)
    expect(ref.current?.getSelection()).toEqual({ x: 15, y: 15, width: 10, height: 10 })
  })

  it('follows the pointer past the left and top edges', () => {
    const { ref, drag, selectBlock } = setup()
    selectBlock()
    drag([7, 7], [[0, 1]], 2)
    expect(ref.current?.getSelection()).toEqual({ x: -5, y: -4, width: 10, height: 10 })
  })

  it('cuts away the part outside the image when it is placed', () => {
    const { ref, drag, pixel, selectBlock } = setup()
    selectBlock()
    drag([7, 7], [[17, 17]], 2)
    expect(ref.current?.getSelection()).toEqual({ x: 12, y: 12, width: 10, height: 10 })
    act(() => ref.current?.clearSelection())
    expect(ref.current?.getSelection()).toBeNull()
    redBlock(pixel, 12, 12)
    expect(pixel(11, 11)).toEqual(white)
    expect(pixel(2, 2)).toEqual(white)
    act(() => ref.current?.undo())
    expect(pixel(2, 2)).toEqual(red)
    expect(pixel(19, 19)).toEqual(white)
  })

  it('keeps every pixel until it is placed, so moving it back in restores it', () => {
    const { ref, drag, pixel, selectBlock } = setup()
    selectBlock()
    drag([7, 7], [[1, 1]], 2)
    expect(ref.current?.getSelection()).toEqual({ x: -4, y: -4, width: 10, height: 10 })
    drag([1, 1], [[11, 11]], 3)
    expect(ref.current?.getSelection()).toEqual({ x: 6, y: 6, width: 10, height: 10 })
    act(() => ref.current?.clearSelection())
    redBlock(pixel, 6, 6)
  })

  it('keeps its full content while dragged far out and back in within one drag', () => {
    const { ref, drag, pixel, selectBlock } = setup()
    selectBlock()
    drag([7, 7], [[40, 40], [-30, -30], [12, 12]], 2)
    expect(ref.current?.getSelection()).toEqual({ x: 7, y: 7, width: 10, height: 10 })
    act(() => ref.current?.clearSelection())
    redBlock(pixel, 7, 7)
  })

  it('keeps a partly outside selection when its outside part is pressed on the workspace', () => {
    const { ref, drag, selectBlock } = setup()
    selectBlock()
    drag([7, 7], [[20, 10]], 2)
    expect(ref.current?.getSelection()).toEqual({ x: 15, y: 5, width: 10, height: 10 })
    act(() => ref.current?.clickOutside(20.5, 10.5))
    expect(ref.current?.getSelection()).toEqual({ x: 15, y: 5, width: 10, height: 10 })
    act(() => ref.current?.clickOutside(40, 40))
    expect(ref.current?.getSelection()).toBeNull()
  })

  it('cuts away the outside part of a transparent selection, still keying out the background', () => {
    const { ref, drag, pixel } = setup(20, 20, true)
    const doc = new Bitmap(20, 20, WHITE)
    doc.set(2, 2, RED)
    doc.set(3, 3, RED)
    doc.set(11, 19, { r: 0, g: 0, b: 255, a: 255 })
    act(() => ref.current?.loadBitmap(doc))
    drag([2, 2], [[11, 11]])
    // (2,2) lands at (9,18) and (3,3) at (10,19); the rest hangs past the bottom.
    drag([7, 7], [[14, 23]], 2)
    expect(ref.current?.getSelection()).toEqual({ x: 9, y: 18, width: 10, height: 10 })
    act(() => ref.current?.clearSelection())
    expect(pixel(9, 18)).toEqual(red)
    expect(pixel(10, 19)).toEqual(red)
    // A keyed-out (white) pixel of the selection does not cover what lies beneath.
    expect(pixel(11, 19)).toEqual([0, 0, 255, 255])
    expect(pixel(2, 2)).toEqual(white)
  })

  it('lets a pasted image be moved partly off the image and cut on placing', () => {
    const { ref, drag, pixel } = setup()
    act(() => ref.current?.pasteBitmap(new Bitmap(10, 10, RED)))
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: 10, height: 10 })
    drag([5, 5], [[2, 17]])
    expect(ref.current?.getSelection()).toEqual({ x: -3, y: 12, width: 10, height: 10 })
    act(() => ref.current?.clearSelection())
    expect(pixel(0, 12)).toEqual(red)
    expect(pixel(6, 19)).toEqual(red)
    expect(pixel(7, 12)).toEqual(white)
    expect(pixel(0, 0)).toEqual(white)
  })

  it('shows the part beyond the image edge in an overflow layer while it floats there', () => {
    const { ref, container, drag, selectBlock } = setup()
    selectBlock()
    drag([7, 7], [[8, 8]], 2)
    expect(container.querySelector('.selection-overflow')).toBeNull()
    drag([8, 8], [[20, 20]], 3)
    const overflow = container.querySelector('.selection-overflow') as HTMLCanvasElement
    expect(overflow).not.toBeNull()
    expect(overflow.style.left).toBe('15px')
    expect(overflow.style.top).toBe('15px')
    expect(overflow.width).toBe(10)
    expect(overflow.height).toBe(10)
    act(() => ref.current?.clearSelection())
    expect(container.querySelector('.selection-overflow')).toBeNull()
  })
})
