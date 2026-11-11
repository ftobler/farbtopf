import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../core/color'
import type { ObjectTarget } from '../core/objectSelect'
import type { Selection } from '../core/selection'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

/** An Object Selection stand-in whose answers the test hands out. */
function deferredSelect() {
  const calls: { width: number; height: number; pixels: Uint8ClampedArray; target: ObjectTarget }[] = []
  const answers: { resolve: (selection: Selection | null) => void; reject: (error: Error) => void }[] = []
  const select = vi.fn(
    (width: number, height: number, pixels: Uint8ClampedArray, target: ObjectTarget) =>
      new Promise<Selection | null>((resolve, reject) => {
        calls.push({ width, height, pixels, target })
        answers.push({ resolve, reject })
      }),
  )
  return { select, calls, answers }
}

function setup(width = 40, height = 30) {
  const ref = createRef<PaintCanvasHandle>()
  const onSelectionChange = vi.fn()
  const fake = deferredSelect()
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
      onSelectionChange={onSelectionChange}
      transparentSelection={false}
      selectionShape="object"
      objectSelect={fake.select}
    />,
  )
  const canvas = container.querySelector('canvas') as HTMLCanvasElement
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  return { ref, canvas, container, onSelectionChange, ...fake }
}

function drag(canvas: HTMLCanvasElement, from: [number, number], to: [number, number], pointerId = 1) {
  fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(canvas, { pointerId, clientX: to[0], clientY: to[1] })
  fireEvent.pointerUp(canvas, { pointerId, clientX: to[0], clientY: to[1] })
}

const found: Selection = {
  rect: { x: 6, y: 5, width: 3, height: 2 },
  mask: { width: 3, height: 2, data: new Uint8Array([0, 1, 0, 1, 1, 1]) },
}

describe('PaintCanvas object selection', () => {
  it('selects the object inside a dragged rectangle, showing the rectangle meanwhile', async () => {
    const { ref, canvas, calls, answers } = setup()
    drag(canvas, [4, 3], [14, 11])
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toEqual({ kind: 'rect', rect: { x: 4, y: 3, width: 11, height: 9 } })
    expect(ref.current?.getSelection()).toEqual({ x: 4, y: 3, width: 11, height: 9 })
    await act(async () => answers[0].resolve(found))
    expect(ref.current?.getSelection()).toEqual(found.rect)
  })

  it('selects the object under a click', async () => {
    const { ref, canvas, calls, answers } = setup()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 7, clientY: 6 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 7, clientY: 6 })
    expect(calls.map((call) => call.target)).toEqual([{ kind: 'point', point: { x: 7, y: 6 } }])
    expect(ref.current?.getSelection()).toBeNull()
    await act(async () => answers[0].resolve(found))
    expect(ref.current?.getSelection()).toEqual(found.rect)
  })

  it('samples the visible image: every layer flattened, at the canvas size', () => {
    const { ref, canvas, calls } = setup(40, 30)
    act(() => ref.current?.addLayer())
    drag(canvas, [4, 3], [14, 11])
    expect(calls[0].width).toBe(40)
    expect(calls[0].height).toBe(30)
    expect(calls[0].pixels).toHaveLength(40 * 30 * 4)
    // The white background shows through the empty new layer.
    expect(Array.from(calls[0].pixels.slice(0, 4))).toEqual([255, 255, 255, 255])
  })

  it('selects nothing when no object is found or the selection fails', async () => {
    const { ref, canvas, answers } = setup()
    drag(canvas, [4, 3], [14, 11])
    await act(async () => answers[0].resolve(null))
    expect(ref.current?.getSelection()).toBeNull()
    drag(canvas, [4, 3], [14, 11], 2)
    await act(async () => answers[1].reject(new Error('trap')))
    expect(ref.current?.getSelection()).toBeNull()
  })

  it('drops an answer that arrives after the selection changed', async () => {
    const { ref, canvas, answers } = setup()
    drag(canvas, [4, 3], [14, 11])
    act(() => ref.current?.selectAll())
    await act(async () => answers[0].resolve(found))
    expect(ref.current?.getSelection()).toEqual({ x: 0, y: 0, width: 40, height: 30 })
  })

  it('keeps only the answer to the latest of two quick selections', async () => {
    const { ref, canvas, answers } = setup()
    drag(canvas, [4, 3], [14, 11])
    drag(canvas, [20, 10], [30, 20], 2)
    await act(async () => answers[0].resolve(found))
    expect(ref.current?.getSelection()).toEqual({ x: 20, y: 10, width: 11, height: 11 })
    const later = { rect: { x: 22, y: 12, width: 4, height: 4 }, mask: null }
    await act(async () => answers[1].resolve(later))
    expect(ref.current?.getSelection()).toEqual(later.rect)
  })

  it('shows a busy cursor while an object is being found', async () => {
    const { canvas, answers } = setup()
    drag(canvas, [4, 3], [14, 11])
    expect(canvas.style.cursor).toBe('progress')
    await act(async () => answers[0].resolve(found))
    expect(canvas.style.cursor).not.toBe('progress')
  })
})
