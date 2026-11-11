import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Removal } from '../core/algorithms'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const W = 40
const H = 30

/** A Remove Tool stand-in whose answers the test hands out. */
function deferredRemove() {
  const calls: { width: number; height: number; pixels: Uint8ClampedArray; stroke: Uint8Array }[] = []
  const answers: { resolve: (removal: Removal | null) => void; reject: (error: Error) => void }[] = []
  const remove = vi.fn(
    (width: number, height: number, pixels: Uint8ClampedArray, stroke: Uint8Array) =>
      new Promise<Removal | null>((resolve, reject) => {
        // Copies, as the worker client sends.
        calls.push({ width, height, pixels: pixels.slice(), stroke: stroke.slice() })
        answers.push({ resolve, reject })
      }),
  )
  return { remove, calls, answers }
}

function setup(brushSize = 3) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const fake = deferredRemove()
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={W}
      initialHeight={H}
      tool="remove"
      primary={BLACK}
      secondary={WHITE}
      brushSize={brushSize}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      transparentSelection={false}
      removeObject={fake.remove}
    />,
  )
  const canvas = container.querySelector('canvas') as HTMLCanvasElement
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: W, bottom: H, width: W, height: H, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const overlay = () => container.querySelector('.remove-overlay')
  return { ref, canvas, overlay, onHistoryChange, ...fake }
}

function stroke(canvas: HTMLCanvasElement, points: [number, number][], pointerId = 1) {
  const [first, ...rest] = points
  fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: first[0], clientY: first[1] })
  for (const [x, y] of rest) fireEvent.pointerMove(canvas, { pointerId, clientX: x, clientY: y })
  const last = points[points.length - 1]
  fireEvent.pointerUp(canvas, { pointerId, clientX: last[0], clientY: last[1] })
}

const pixel = (data: Uint8ClampedArray, x: number, y: number) => Array.from(data.slice((y * W + x) * 4, (y * W + x) * 4 + 4))

/** A red removal over the 4×2 rectangle at (10, 10). */
const redPatch: Removal = {
  rect: { x: 10, y: 10, width: 4, height: 2 },
  pixels: new Uint8ClampedArray(4 * 2 * 4).map((_, i) => (i % 4 === 0 || i % 4 === 3 ? 255 : 0)),
}

describe('PaintCanvas Remove Tool', () => {
  it('sends the active layer and the stroke it painted, as wide as the brush', () => {
    const { canvas, calls } = setup(3)
    stroke(canvas, [
      [10, 10],
      [16, 10],
    ])
    expect(calls).toHaveLength(1)
    const { width, height, pixels, stroke: painted } = calls[0]
    expect([width, height]).toEqual([W, H])
    expect(pixels).toHaveLength(W * H * 4)
    expect(pixel(pixels, 0, 0)).toEqual([255, 255, 255, 255])
    const marked = (x: number, y: number) => painted[y * W + x] === 1
    expect(marked(10, 10) && marked(13, 10) && marked(16, 10) && marked(13, 9) && marked(13, 11)).toBe(true)
    expect(marked(13, 12) || marked(13, 8) || marked(19, 10)).toBe(false)
  })

  it('applies the fill as one undo step', async () => {
    const { ref, canvas, calls, answers } = setup()
    stroke(canvas, [[11, 10]])
    await act(async () => answers[0].resolve(redPatch))
    stroke(canvas, [[30, 20]])
    expect(pixel(calls[1].pixels, 10, 10)).toEqual([255, 0, 0, 255])
    expect(pixel(calls[1].pixels, 13, 11)).toEqual([255, 0, 0, 255])
    expect(pixel(calls[1].pixels, 14, 10)).toEqual([255, 255, 255, 255])
    await act(async () => answers[1].resolve(null))
    act(() => ref.current?.undo())
    stroke(canvas, [[30, 20]], 2)
    expect(pixel(calls[2].pixels, 10, 10)).toEqual([255, 255, 255, 255])
  })

  it('records nothing when nothing is removed or the removal fails', async () => {
    const { canvas, answers, onHistoryChange } = setup()
    const before = onHistoryChange.mock.calls.length
    stroke(canvas, [[11, 10]])
    await act(async () => answers[0].resolve(null))
    stroke(canvas, [[11, 10]], 2)
    await act(async () => answers[1].reject(new Error('trap')))
    expect(onHistoryChange.mock.calls.length).toBe(before)
  })

  it('shows the stroke while it is painted and until the fill arrives, with a busy cursor meanwhile', async () => {
    const { canvas, overlay, answers } = setup()
    expect(overlay()).toBeNull()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 9, clientY: 5 })
    expect(overlay()).not.toBeNull()
    expect(overlay()?.querySelector('polyline')?.getAttribute('points')).toBe('5.5,5.5 9.5,5.5')
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 9, clientY: 5 })
    expect(overlay()).not.toBeNull()
    expect(canvas.style.cursor).toBe('progress')
    await act(async () => answers[0].resolve(redPatch))
    expect(overlay()).toBeNull()
    expect(canvas.style.cursor).not.toBe('progress')
  })

  it('ignores new strokes while a removal is still being worked out', async () => {
    const { canvas, calls, answers } = setup()
    stroke(canvas, [[11, 10]])
    stroke(canvas, [[30, 20]], 2)
    expect(calls).toHaveLength(1)
    await act(async () => answers[0].resolve(null))
    stroke(canvas, [[30, 20]], 3)
    expect(calls).toHaveLength(2)
  })

  it('drops a fill when the pixels it would replace changed meanwhile', async () => {
    const { ref, canvas, calls, answers } = setup()
    stroke(canvas, [[11, 10]])
    act(() => ref.current?.invertColors())
    await act(async () => answers[0].resolve(redPatch))
    answers.length = 0
    stroke(canvas, [[30, 20]], 2)
    expect(pixel(calls[1].pixels, 10, 10)).toEqual([0, 0, 0, 255])
  })

  it('applies a fill when only pixels outside it changed', async () => {
    const { ref, canvas, calls, answers } = setup()
    const image = new Bitmap(W, H, { r: 255, g: 255, b: 255, a: 255 })
    act(() => ref.current?.loadBitmap(image))
    stroke(canvas, [[11, 10]])
    act(() => ref.current?.selectAll())
    act(() => ref.current?.clearSelection())
    await act(async () => answers[0].resolve(redPatch))
    stroke(canvas, [[30, 20]], 2)
    expect(pixel(calls[1].pixels, 10, 10)).toEqual([255, 0, 0, 255])
  })

  it('drops a stroke whose pointer is cancelled', () => {
    const { canvas, overlay, calls } = setup()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerCancel(canvas, { pointerId: 1 })
    expect(calls).toHaveLength(0)
    expect(overlay()).toBeNull()
  })
})
