import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Rgba } from '../core/color'
import { BLACK, WHITE } from '../core/color'
import type { ShapeKind } from '../core/shapes'
import { PaintCanvas } from './PaintCanvas'

const SIZE = 40
const rgbaOf = (color: Rgba) => [color.r, color.g, color.b, color.a]
const black = rgbaOf(BLACK)
const white = rgbaOf(WHITE)

interface Keys {
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

function setup(shapeKind: ShapeKind = 'rectangle') {
  const { container } = render(
    <PaintCanvas
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool="shape"
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      brush="round"
      shapeFill="outline"
      shapeKind={shapeKind}
      zoom={1}
      showGrid={false}
      onHistoryChange={vi.fn()}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
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
    return Array.from(image.data.slice(i, i + 4))
  }
  const down = (x: number, y: number, keys: Keys = {}) =>
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: x, clientY: y, ...keys })
  const move = (x: number, y: number, keys: Keys = {}) =>
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: x, clientY: y, ...keys })
  const up = (x: number, y: number, keys: Keys = {}) =>
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: x, clientY: y, ...keys })
  const commit = () => act(() => fireEvent.keyDown(window, { key: 'Enter' }))
  return { shown, down, move, up, commit }
}

describe('PaintCanvas shape drag modifiers', () => {
  it('drags out a plain rectangle without modifiers', () => {
    const { shown, down, move, up } = setup()
    down(5, 5)
    move(15, 10)
    up(15, 10)
    expect(shown(5, 10)).toEqual(black)
    expect(shown(5, 13)).toEqual(white)
  })

  it('squares the rectangle while Shift is held, and keeps it on release', () => {
    const { shown, down, move, up, commit } = setup()
    down(5, 5)
    move(15, 10, { shiftKey: true })
    expect(shown(5, 13)).toEqual(black)
    expect(shown(15, 15)).toEqual(black)
    up(15, 10, { shiftKey: true })
    commit()
    expect(shown(5, 13)).toEqual(black)
    expect(shown(10, 15)).toEqual(black)
  })

  it('draws from the centre while Ctrl is held', () => {
    const { shown, down, move, up } = setup()
    down(20, 20)
    move(25, 23, { ctrlKey: true })
    up(25, 23, { ctrlKey: true })
    // The box spans 15..25 x 17..23, centred on the press.
    expect(shown(15, 20)).toEqual(black)
    expect(shown(20, 17)).toEqual(black)
    expect(shown(20, 23)).toEqual(black)
  })

  it('treats Cmd like Ctrl', () => {
    const { shown, down, move, up } = setup()
    down(20, 20)
    move(25, 23, { metaKey: true })
    up(25, 23, { metaKey: true })
    expect(shown(15, 20)).toEqual(black)
  })

  it('draws a centred square with Shift and Ctrl together', () => {
    const { shown, down, move, up } = setup()
    down(20, 20)
    move(25, 22, { shiftKey: true, ctrlKey: true })
    up(25, 22, { shiftKey: true, ctrlKey: true })
    // The box spans 15..25 x 15..25.
    expect(shown(15, 20)).toEqual(black)
    expect(shown(20, 15)).toEqual(black)
    expect(shown(20, 25)).toEqual(black)
  })

  it('reacts to Shift being pressed and released without moving the pointer', () => {
    const { shown, down, move, up } = setup()
    down(5, 5)
    move(15, 10)
    expect(shown(5, 13)).toEqual(white)
    act(() => {
      fireEvent.keyDown(window, { key: 'Shift', shiftKey: true })
    })
    expect(shown(5, 13)).toEqual(black)
    act(() => {
      fireEvent.keyUp(window, { key: 'Shift', shiftKey: false })
    })
    expect(shown(5, 13)).toEqual(white)
    expect(shown(5, 10)).toEqual(black)
    up(15, 10)
  })

  it('reacts to Ctrl being pressed without moving the pointer', () => {
    const { shown, down, move, up } = setup()
    down(20, 20)
    move(25, 23)
    expect(shown(15, 20)).toEqual(white)
    act(() => {
      fireEvent.keyDown(window, { key: 'Control', ctrlKey: true })
    })
    expect(shown(15, 20)).toEqual(black)
    up(25, 23, { ctrlKey: true })
  })

  it('snaps a line to 45 degree steps with Shift', () => {
    const { shown, down, move, up } = setup('line')
    down(5, 5)
    move(25, 8, { shiftKey: true })
    up(25, 8, { shiftKey: true })
    expect(shown(25, 5)).toEqual(black)
    expect(shown(25, 8)).toEqual(white)
  })

  it('extends a line both ways from the press with Ctrl', () => {
    const { shown, down, move, up } = setup('line')
    down(20, 20)
    move(30, 20, { ctrlKey: true })
    up(30, 20, { ctrlKey: true })
    expect(shown(10, 20)).toEqual(black)
    expect(shown(30, 20)).toEqual(black)
  })

  it('keeps the aspect ratio when a corner handle is dragged with Shift', () => {
    const { shown, down, move, up } = setup()
    down(5, 5)
    move(15, 10)
    up(15, 10)
    // Grab the south-east handle of the 10 x 5 box and drag it out.
    down(15, 10)
    move(25, 12, { shiftKey: true })
    up(25, 12, { shiftKey: true })
    // The corner lands on the box's diagonal at (24, 14), not at (25, 12).
    expect(shown(24, 14)).toEqual(black)
    expect(shown(5, 14)).toEqual(black)
    expect(shown(25, 12)).toEqual(white)
  })
})
