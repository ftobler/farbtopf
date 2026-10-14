// A PaintCanvas harness for the undo tests: a 30 x 30 canvas laid out at 100 %,
// loaded with a half red, half green image, and helpers that drive it like a user.

import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import type { Rgba } from '../core/color'
import { BLACK, WHITE } from '../core/color'
import type { BrushId } from '../core/brushes'
import { SPRAY_TICK_MS } from '../core/brushes'
import type { LayerInfo } from '../core/layers'
import { seededRandom } from '../core/random'
import type { ShapeKind } from '../core/shapes'
import type { ToolId } from '../core/tools'
import { DEFAULT_TEXT_OPTIONS } from '../render/text'
import { PaintCanvas } from '../components/PaintCanvas'
import type { PaintCanvasHandle } from '../components/PaintCanvas'

export const SIZE = 30
export const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }
export const GREEN: Rgba = { r: 0, g: 255, b: 0, a: 255 }

/** Left half red, right half green: blurring, filling and inverting all visibly change it. */
export function baseImage(): Bitmap {
  const bitmap = new Bitmap(SIZE, SIZE, RED)
  for (let y = 0; y < SIZE; y += 1) for (let x = SIZE / 2; x < SIZE; x += 1) bitmap.set(x, y, GREEN)
  return bitmap
}

interface Props {
  tool: ToolId
  brush: BrushId
  shapeKind: ShapeKind
  secondary: Rgba
  transparentSelection: boolean
  opacity: number
}

export function setup(initial: Partial<Props> = {}) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn<(canUndo: boolean, canRedo: boolean) => void>()
  const onDocumentChange = vi.fn()
  const onLayersChange = vi.fn<(layers: LayerInfo[], active: number) => void>()
  const onSizeChange = vi.fn<(width: number, height: number) => void>()
  let props: Props = {
    tool: 'pencil',
    brush: 'round',
    shapeKind: 'rectangle',
    secondary: WHITE,
    transparentSelection: false,
    opacity: 100,
    ...initial,
  }
  const element = () => (
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool={props.tool}
      brush={props.brush}
      shapeKind={props.shapeKind}
      random={seededRandom(7)}
      primary={BLACK}
      secondary={props.secondary}
      brushSize={3}
      opacity={props.opacity}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onDocumentChange={onDocumentChange}
      onLayersChange={onLayersChange}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={onSizeChange}
      transparentSelection={props.transparentSelection}
      selectionShape="rectangle"
      text={DEFAULT_TEXT_OPTIONS}
    />
  )
  const { container, rerender } = render(element())
  const setProps = (next: Partial<Props>) => {
    props = { ...props, ...next }
    rerender(element())
  }
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  act(() => ref.current?.loadBitmap(baseImage()))

  /** Drags with the left button, or with the right one (`button` 2). */
  const drag = (from: [number, number], to: [number, number], button: 0 | 2 = 0) => {
    const buttons = button === 2 ? 2 : 1
    fireEvent.pointerDown(canvas, { button, buttons, pointerId: 1, clientX: from[0], clientY: from[1] })
    fireEvent.pointerMove(canvas, { buttons, pointerId: 1, clientX: (from[0] + to[0]) / 2, clientY: (from[1] + to[1]) / 2 })
    fireEvent.pointerMove(canvas, { buttons, pointerId: 1, clientX: to[0], clientY: to[1] })
    fireEvent.pointerUp(canvas, { button, pointerId: 1, clientX: to[0], clientY: to[1] })
  }
  const click = (x: number, y: number, button: 0 | 2 = 0) => {
    fireEvent.pointerDown(canvas, { button, buttons: button === 2 ? 2 : 1, pointerId: 1, clientX: x, clientY: y })
    fireEvent.pointerUp(canvas, { button, pointerId: 1, clientX: x, clientY: y })
  }
  /** Holds the pointer still at `at` for `ticks` spray timer ticks. */
  const hold = (at: [number, number], ticks: number) => {
    vi.useFakeTimers()
    try {
      fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: at[0], clientY: at[1] })
      act(() => {
        vi.advanceTimersByTime(SPRAY_TICK_MS * ticks)
      })
      fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: at[0], clientY: at[1] })
    } finally {
      vi.useRealTimers()
    }
  }
  /** Drags the selection's rotate handle, in canvas pixels. */
  const rotateByHandle = (from: [number, number], to: [number, number]) => {
    const handle = container.querySelector<HTMLElement>('.selection-rotate-handle')
    if (!handle) throw new Error('rotate handle not rendered')
    handle.setPointerCapture = vi.fn()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 5, clientX: from[0], clientY: from[1] })
    fireEvent.pointerMove(handle, { pointerId: 5, clientX: to[0], clientY: to[1] })
    fireEvent.pointerUp(handle, { pointerId: 5, clientX: to[0], clientY: to[1] })
  }
  const enter = () => act(() => fireEvent.keyDown(window, { key: 'Enter' }))
  const editor = () => container.querySelector<HTMLTextAreaElement>('.text-editor')
  /** Opens a text box with a click and types into it. */
  const typeText = (value: string, at: [number, number] = [4, 4]) => {
    click(at[0], at[1])
    const textarea = editor()
    if (!textarea) throw new Error('text box did not open')
    fireEvent.change(textarea, { target: { value } })
    return textarea
  }
  /** Selects a rectangle with the Select tool. */
  const select = (from: [number, number], to: [number, number]) => {
    setProps({ tool: 'select' })
    drag(from, to)
  }
  const resizeByHandle = (dx: number, dy = 0) => {
    const frame = container.querySelector<HTMLElement>('.canvas-frame')
    const handle = container.querySelector<HTMLElement>('.canvas-resize-handle-se')
    if (!frame || !handle) throw new Error('resize handle not rendered')
    frame.getBoundingClientRect = () =>
      ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
    handle.setPointerCapture = vi.fn()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 9, clientX: SIZE, clientY: SIZE })
    fireEvent.pointerMove(handle, { pointerId: 9, clientX: SIZE + dx / 2, clientY: SIZE + dy / 2 })
    fireEvent.pointerMove(handle, { pointerId: 9, clientX: SIZE + dx, clientY: SIZE + dy })
    fireEvent.pointerUp(handle, { pointerId: 9, clientX: SIZE + dx, clientY: SIZE + dy })
  }

  /** Everything an undo step must bring back: the shown pixels, the size (as reported too) and the layer stack. */
  const state = () => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number; height: number }
    const layers = onLayersChange.mock.calls.at(-1)
    return {
      size: ref.current?.getSize(),
      reportedSize: onSizeChange.mock.calls.at(-1),
      shown: { width: image.width, height: image.height, data: Array.from(image.data) },
      layers: layers?.[0].map((layer) => `${layer.id}:${layer.name}`),
      active: layers?.[1],
    }
  }
  /** Runs a handle method as its own React update. */
  const call = (run: (handle: PaintCanvasHandle) => void) =>
    act(() => {
      if (ref.current) run(ref.current)
    })
  const history = () => onHistoryChange.mock.calls.at(-1)
  return {
    ref,
    call,
    container,
    canvas,
    props: () => props,
    setProps,
    drag,
    click,
    hold,
    rotateByHandle,
    enter,
    editor,
    typeText,
    select,
    resizeByHandle,
    state,
    history,
    onHistoryChange,
    onDocumentChange,
    onLayersChange,
  }
}

export type Setup = ReturnType<typeof setup>
