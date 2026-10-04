import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import type { Rgba } from '../core/color'
import { BLACK, WHITE } from '../core/color'
import { drawLine } from '../core/raster'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 40
const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }
const rgbaOf = (color: Rgba) => [color.r, color.g, color.b, color.a]
const black = rgbaOf(BLACK)
const white = rgbaOf(WHITE)

interface Keys {
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

interface Props {
  tool: 'shape' | 'brush'
  primary: Rgba
  brushSize: number
}

function setup(initial: Partial<Props> = {}) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  let props: Props = { tool: 'shape', primary: BLACK, brushSize: 1, ...initial }
  const element = () => (
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool={props.tool}
      primary={props.primary}
      secondary={WHITE}
      brushSize={props.brushSize}
      brush="round"
      shapeFill="outline"
      shapeKind="line"
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      transparentSelection={false}
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
  const image = () => {
    const shownImage = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
    return shownImage.data
  }
  const shown = (x: number, y: number) => {
    const i = (y * SIZE + x) * 4
    return Array.from(image().slice(i, i + 4))
  }
  const down = (x: number, y: number, keys: Keys = {}) =>
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: x, clientY: y, ...keys })
  const move = (x: number, y: number, keys: Keys = {}) =>
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: x, clientY: y, ...keys })
  const up = (x: number, y: number, keys: Keys = {}) =>
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: x, clientY: y, ...keys })
  const drag = (from: [number, number], to: [number, number], keys: Keys = {}) => {
    down(from[0], from[1], keys)
    move(to[0], to[1], keys)
    up(to[0], to[1], keys)
  }
  const handles = () =>
    Array.from(container.querySelectorAll('.shape-handle')).map((handle) => [
      Number(handle.getAttribute('cx')),
      Number(handle.getAttribute('cy')),
    ])
  const key = (type: 'keyDown' | 'keyUp', init: KeyboardEventInit) => act(() => void fireEvent[type](window, init))
  const commit = () => key('keyDown', { key: 'Enter' })
  return { ref, onHistoryChange, image, shown, down, move, up, drag, handles, key, commit, setProps }
}

/** A white canvas with one plain round line, the way the line tool has always drawn it. */
function reference(from: [number, number], to: [number, number], width: number) {
  const bitmap = new Bitmap(SIZE, SIZE, WHITE)
  drawLine(bitmap, { x: from[0], y: from[1] }, { x: to[0], y: to[1] }, width, BLACK, 'round')
  return Array.from(bitmap.data)
}

describe('PaintCanvas pending line', () => {
  it('stays pending with a handle at each end after it is dragged out', () => {
    const { ref, drag, handles, onHistoryChange } = setup()
    drag([5, 20], [30, 20])
    expect(ref.current?.hasPendingShape()).toBe(true)
    expect(handles()).toEqual([
      [5.5, 20.5],
      [30.5, 20.5],
    ])
    expect(onHistoryChange).not.toHaveBeenCalledWith(true, false)
  })

  it('stamps exactly the plain line when committed without edits', () => {
    const { image, drag, commit } = setup({ brushSize: 3 })
    drag([5, 7], [31, 26])
    commit()
    expect(Array.from(image())).toEqual(reference([5, 7], [31, 26], 3))
  })

  it('moves an end when its handle is dragged, as one undo step on commit', () => {
    const { ref, shown, drag, commit, onHistoryChange } = setup()
    drag([5, 20], [30, 20])
    drag([30, 20], [30, 30])
    expect(shown(30, 30)).toEqual(black)
    expect(shown(30, 20)).toEqual(white)
    expect(ref.current?.hasPendingShape()).toBe(true)
    commit()
    expect(shown(30, 30)).toEqual(black)
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    act(() => ref.current?.undo())
    expect(shown(30, 30)).toEqual(white)
    expect(shown(5, 20)).toEqual(white)
  })

  it('snaps a dragged end to 45 degree steps around the other end with Shift', () => {
    const { shown, drag } = setup()
    drag([5, 20], [30, 20])
    drag([30, 20], [30, 26], { shiftKey: true })
    expect(shown(30, 20)).toEqual(black)
    expect(shown(30, 26)).toEqual(white)
  })

  it('mirrors the other end about the midpoint with Ctrl', () => {
    const { shown, drag } = setup()
    drag([10, 20], [30, 20])
    drag([30, 20], [30, 25], { ctrlKey: true })
    expect(shown(30, 25)).toEqual(black)
    expect(shown(10, 15)).toEqual(black)
    expect(shown(10, 20)).toEqual(white)
  })

  it('reacts to Shift and Ctrl while an end is held, without moving the pointer', () => {
    const { shown, down, move, up, key } = setup()
    down(10, 20)
    move(30, 20)
    up(30, 20)
    down(30, 20)
    move(30, 23)
    expect(shown(30, 23)).toEqual(black)
    key('keyDown', { key: 'Shift', shiftKey: true })
    expect(shown(30, 23)).toEqual(white)
    expect(shown(30, 20)).toEqual(black)
    key('keyUp', { key: 'Shift', shiftKey: false })
    expect(shown(30, 23)).toEqual(black)
    key('keyDown', { key: 'Control', ctrlKey: true })
    expect(shown(10, 17)).toEqual(black)
    up(30, 23, { ctrlKey: true })
  })

  it('moves the whole line when its body is dragged', () => {
    const { ref, shown, drag, handles } = setup()
    drag([5, 20], [30, 20])
    drag([15, 20], [17, 30])
    expect(shown(7, 30)).toEqual(black)
    expect(shown(32, 30)).toEqual(black)
    expect(shown(15, 20)).toEqual(white)
    expect(handles()).toEqual([
      [7.5, 30.5],
      [32.5, 30.5],
    ])
    expect(ref.current?.hasPendingShape()).toBe(true)
  })

  it('grabs the body a few pixels beside a thin stroke', () => {
    const { shown, drag } = setup()
    drag([5, 20], [30, 20])
    drag([15, 23], [15, 33])
    expect(shown(15, 30)).toEqual(black)
    expect(shown(15, 20)).toEqual(white)
  })

  it('places the line and starts a new one on a press away from it', () => {
    const { ref, shown, drag, onHistoryChange } = setup()
    drag([5, 20], [30, 20])
    drag([5, 32], [30, 32])
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    expect(shown(15, 20)).toEqual(black)
    expect(shown(15, 32)).toEqual(black)
    expect(ref.current?.hasPendingShape()).toBe(true)
  })

  it('follows a colour or size change after it was edited', () => {
    const { shown, drag, setProps, commit } = setup()
    drag([5, 20], [30, 20])
    drag([30, 20], [30, 30])
    setProps({ primary: RED, brushSize: 5 })
    expect(shown(30, 30)).toEqual(rgbaOf(RED))
    expect(shown(30, 32)).toEqual(rgbaOf(RED))
    commit()
    expect(shown(30, 30)).toEqual(rgbaOf(RED))
  })

  it('is placed when another tool is picked', () => {
    const { ref, shown, drag, setProps } = setup()
    drag([5, 20], [30, 20])
    drag([30, 20], [30, 30])
    setProps({ tool: 'brush' })
    expect(ref.current?.hasPendingShape()).toBe(false)
    expect(shown(30, 30)).toEqual(black)
  })

  it('is dropped by Escape after an edit, leaving no history', () => {
    const { ref, shown, drag, key, onHistoryChange } = setup()
    drag([5, 20], [30, 20])
    drag([15, 20], [15, 30])
    key('keyDown', { key: 'Escape' })
    expect(ref.current?.hasPendingShape()).toBe(false)
    expect(shown(15, 30)).toEqual(white)
    expect(shown(15, 20)).toEqual(white)
    expect(onHistoryChange).not.toHaveBeenCalledWith(true, false)
  })
})
