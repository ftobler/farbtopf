import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BrushId } from '../core/brushes'
import type { Rgba } from '../core/color'
import type { ShapeKind } from '../core/shapes'
import type { ToolId } from '../core/tools'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 20
const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }
const BLUE: Rgba = { r: 0, g: 0, b: 255, a: 255 }
const WHITE_PIXEL = { r: 255, g: 255, b: 255, a: 255 }

function setup(tool: ToolId, brush: BrushId = 'round', shapeKind: ShapeKind = 'rectangle') {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const onPickColor = vi.fn()
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool={tool}
      primary={RED}
      secondary={BLUE}
      brushSize={3}
      brush={brush}
      shapeKind={shapeKind}
      random={() => 0.5}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={onPickColor}
      onSizeChange={vi.fn()}
      transparentSelection={false}
    />,
  )
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  const shown = (x: number, y: number) => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
    const i = (y * image.width + x) * 4
    const [r, g, b, a] = Array.from(image.data.slice(i, i + 4))
    return { r, g, b, a }
  }
  const rightDrag = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    fireEvent.pointerDown(canvas, { button: 2, buttons: 2, pointerId: 1, clientX: from.x, clientY: from.y })
    fireEvent.pointerMove(canvas, { button: -1, buttons: 2, pointerId: 1, clientX: to.x, clientY: to.y })
    fireEvent.pointerUp(canvas, { button: 2, buttons: 0, pointerId: 1, clientX: to.x, clientY: to.y })
  }
  const leftDrag = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: from.x, clientY: from.y })
    fireEvent.pointerMove(canvas, { button: -1, buttons: 1, pointerId: 1, clientX: to.x, clientY: to.y })
    fireEvent.pointerUp(canvas, { button: 0, buttons: 0, pointerId: 1, clientX: to.x, clientY: to.y })
  }
  const rightClick = (x: number, y: number) => {
    fireEvent.pointerDown(canvas, { button: 2, buttons: 2, pointerId: 1, clientX: x, clientY: y })
    fireEvent.pointerUp(canvas, { button: 2, buttons: 0, pointerId: 1, clientX: x, clientY: y })
  }
  return { ref, canvas, context, shown, rightClick, rightDrag, leftDrag, onHistoryChange, onPickColor }
}

describe('PaintCanvas right click', () => {
  it('fills with the secondary colour as one undo step', () => {
    const { ref, shown, rightClick, onHistoryChange } = setup('fill')
    rightClick(5, 5)
    expect(shown(0, 0)).toEqual(BLUE)
    expect(shown(19, 19)).toEqual(BLUE)
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    act(() => ref.current?.undo())
    expect(shown(5, 5)).toEqual(WHITE_PIXEL)
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
  })

  it('picks a colour into the secondary slot', () => {
    const { onPickColor, rightClick } = setup('picker')
    rightClick(5, 5)
    expect(onPickColor).toHaveBeenCalledTimes(1)
    expect(onPickColor).toHaveBeenLastCalledWith(WHITE_PIXEL, 'secondary')
  })

  it('erases with the primary colour on the bottom layer as one undo step', () => {
    const { ref, shown, rightDrag, onHistoryChange } = setup('eraser')
    rightDrag({ x: 5, y: 5 }, { x: 12, y: 5 })
    expect(shown(5, 5)).toEqual(RED)
    expect(shown(9, 5)).toEqual(RED)
    expect(shown(12, 5)).toEqual(RED)
    expect(shown(5, 15)).toEqual(WHITE_PIXEL)
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    act(() => ref.current?.undo())
    expect(shown(9, 5)).toEqual(WHITE_PIXEL)
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
  })

  it('still erases to transparency on an upper layer', () => {
    const { ref, shown, rightDrag } = setup('eraser')
    act(() => ref.current?.addLayer())
    rightDrag({ x: 5, y: 5 }, { x: 12, y: 5 })
    // The flattened view shows the white bottom layer through the cleared pixels.
    expect(shown(9, 5)).toEqual(WHITE_PIXEL)
  })

  it('draws a pencil stroke in the secondary colour as one undo step', () => {
    const { ref, shown, rightDrag, onHistoryChange } = setup('pencil')
    rightDrag({ x: 5, y: 5 }, { x: 12, y: 5 })
    expect(shown(5, 5)).toEqual(BLUE)
    expect(shown(9, 5)).toEqual(BLUE)
    expect(shown(12, 5)).toEqual(BLUE)
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    act(() => ref.current?.undo())
    expect(shown(9, 5)).toEqual(WHITE_PIXEL)
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
  })

  it('draws a brush stroke in the secondary colour', () => {
    const { shown, rightDrag } = setup('brush')
    rightDrag({ x: 5, y: 5 }, { x: 12, y: 5 })
    expect(shown(9, 5)).toEqual(BLUE)
  })

  it.each<[ToolId, BrushId]>([
    ['airbrush', 'round'],
    ['brush', 'spray'],
    ['brush', 'calligraphy'],
    ['brush', 'soft'],
    ['brush', 'natural'],
    ['brush', 'highlighter'],
  ])('paints with the secondary colour only: %s %s', (tool, brush) => {
    const { context, rightDrag } = setup(tool, brush)
    rightDrag({ x: 5, y: 5 }, { x: 12, y: 5 })
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
    let painted = 0
    for (let i = 0; i < image.data.length; i += 4) {
      const [r, g, b] = image.data.slice(i, i + 3)
      if (r === 255 && g === 255 && b === 255) continue
      painted++
      // Anything but white is a shade of blue: never any red from the primary colour.
      expect(r).toBe(g)
      expect(b).toBe(255)
    }
    expect(painted).toBeGreaterThan(0)
  })

  it('ends a right-button stroke on its release, so the next left stroke is primary', () => {
    const { ref, canvas, shown, rightDrag, leftDrag, onHistoryChange } = setup('pencil')
    rightDrag({ x: 5, y: 5 }, { x: 12, y: 5 })
    fireEvent.pointerMove(canvas, { button: -1, buttons: 0, pointerId: 1, clientX: 12, clientY: 15 })
    expect(shown(12, 10)).toEqual(WHITE_PIXEL)
    leftDrag({ x: 5, y: 8 }, { x: 12, y: 8 })
    expect(shown(9, 5)).toEqual(BLUE)
    expect(shown(9, 8)).toEqual(RED)
    act(() => ref.current?.undo())
    expect(shown(9, 5)).toEqual(BLUE)
    expect(shown(9, 8)).toEqual(WHITE_PIXEL)
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, true)
    act(() => ref.current?.undo())
    expect(shown(9, 5)).toEqual(WHITE_PIXEL)
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
  })

  it('leaves a pending shape untouched: no commit, no new shape, no handle drag', () => {
    const { ref, context, shown, rightClick, rightDrag, leftDrag, onHistoryChange } = setup('shape')
    leftDrag({ x: 3, y: 3 }, { x: 15, y: 15 })
    expect(ref.current?.hasPendingShape()).toBe(true)
    const calls = onHistoryChange.mock.calls.length
    const paints = context.putImageData.mock.calls.length
    rightClick(18, 18)
    rightClick(15, 15)
    rightDrag({ x: 15, y: 15 }, { x: 18, y: 10 })
    rightDrag({ x: 18, y: 18 }, { x: 10, y: 10 })
    expect(ref.current?.hasPendingShape()).toBe(true)
    expect(onHistoryChange.mock.calls.length).toBe(calls)
    expect(context.putImageData.mock.calls.length).toBe(paints)
    act(() => fireEvent.keyDown(window, { key: 'Enter' }))
    expect(ref.current?.hasPendingShape()).toBe(false)
    expect(shown(3, 9)).toEqual(RED)
    expect(shown(15, 9)).toEqual(RED)
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('reports an unfinished freeform shape as pending', () => {
    const { ref, rightClick, leftDrag } = setup('shape', 'round', 'freeform')
    expect(ref.current?.hasPendingShape()).toBe(false)
    leftDrag({ x: 3, y: 3 }, { x: 15, y: 15 })
    expect(ref.current?.hasPendingShape()).toBe(true)
    rightClick(18, 18)
    expect(ref.current?.hasPendingShape()).toBe(true)
  })

  it('starts no shape on a right-button drag', () => {
    const { ref, rightDrag, onHistoryChange } = setup('shape')
    rightDrag({ x: 3, y: 3 }, { x: 15, y: 15 })
    expect(ref.current?.hasPendingShape()).toBe(false)
    expect(onHistoryChange).not.toHaveBeenCalledWith(true, false)
  })
})
