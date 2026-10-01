import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Rgba } from '../core/color'
import { BLACK, WHITE } from '../core/color'
import type { ShapeKind } from '../core/shapes'
import type { ShapeFill } from '../core/tools'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 30
const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }
const GREEN: Rgba = { r: 0, g: 255, b: 0, a: 255 }

const rgbaOf = (color: Rgba) => [color.r, color.g, color.b, color.a]

interface Props {
  primary: Rgba
  secondary: Rgba
  brushSize: number
  shapeKind: ShapeKind
  shapeFill: ShapeFill
}

function setup(initial: Partial<Props> = {}) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  let props: Props = {
    primary: BLACK,
    secondary: WHITE,
    brushSize: 1,
    shapeKind: 'rectangle',
    shapeFill: 'outline',
    ...initial,
  }
  const element = () => (
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool="shape"
      primary={props.primary}
      secondary={props.secondary}
      brushSize={props.brushSize}
      brush="round"
      shapeFill={props.shapeFill}
      shapeKind={props.shapeKind}
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
  const shown = (x: number, y: number) => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
    const i = (y * image.width + x) * 4
    return Array.from(image.data.slice(i, i + 4))
  }
  const drag = (from: [number, number], to: [number, number]) => {
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: from[0], clientY: from[1] })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: to[0], clientY: to[1] })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: to[0], clientY: to[1] })
  }
  const commit = () => act(() => fireEvent.keyDown(window, { key: 'Enter' }))
  return { ref, shown, drag, setProps, commit, onHistoryChange }
}

describe('PaintCanvas pending shape follows the toolbar', () => {
  it('recolours the pending shape when the primary colour changes, and commits it so', () => {
    const { shown, drag, setProps, commit } = setup()
    drag([5, 5], [25, 25])
    expect(shown(5, 15)).toEqual(rgbaOf(BLACK))
    setProps({ primary: RED })
    expect(shown(5, 15)).toEqual(rgbaOf(RED))
    commit()
    expect(shown(5, 15)).toEqual(rgbaOf(RED))
  })

  it('re-renders the pending shape when the stroke size changes', () => {
    const { shown, drag, setProps, commit } = setup()
    drag([5, 5], [25, 25])
    expect(shown(7, 15)).toEqual(rgbaOf(WHITE))
    setProps({ brushSize: 5 })
    expect(shown(7, 15)).toEqual(rgbaOf(BLACK))
    commit()
    expect(shown(7, 15)).toEqual(rgbaOf(BLACK))
  })

  it('re-renders the pending shape when the fill style changes', () => {
    const { shown, drag, setProps, commit } = setup({ secondary: GREEN })
    drag([5, 5], [25, 25])
    expect(shown(15, 15)).toEqual(rgbaOf(WHITE))
    setProps({ shapeFill: 'outline-filled' })
    expect(shown(15, 15)).toEqual(rgbaOf(GREEN))
    expect(shown(5, 15)).toEqual(rgbaOf(BLACK))
    commit()
    expect(shown(15, 15)).toEqual(rgbaOf(GREEN))
  })

  it('fills with the new secondary colour while the shape is pending', () => {
    const { shown, drag, setProps } = setup({ shapeFill: 'outline-filled' })
    drag([5, 5], [25, 25])
    expect(shown(15, 15)).toEqual(rgbaOf(WHITE))
    setProps({ secondary: GREEN })
    expect(shown(15, 15)).toEqual(rgbaOf(GREEN))
  })

  it('keeps a style change to one undo step', () => {
    const { ref, shown, drag, setProps, commit, onHistoryChange } = setup()
    drag([5, 5], [25, 25])
    onHistoryChange.mockClear()
    setProps({ primary: RED, brushSize: 3 })
    expect(onHistoryChange).not.toHaveBeenCalled()
    commit()
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    act(() => ref.current?.undo())
    expect(shown(5, 15)).toEqual(rgbaOf(WHITE))
  })

  it('recolours a pending line', () => {
    const { shown, drag, setProps } = setup({ shapeKind: 'line' })
    drag([5, 15], [25, 15])
    setProps({ primary: RED })
    expect(shown(15, 15)).toEqual(rgbaOf(RED))
  })
})
