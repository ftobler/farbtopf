import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Rgba } from '../core/color'
import { BLACK, WHITE } from '../core/color'
import type { ShapeKind } from '../core/shapes'
import type { ShapeFill, ToolId } from '../core/tools'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 30
const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }
const GREEN: Rgba = { r: 0, g: 255, b: 0, a: 255 }

const rgbaOf = (color: Rgba) => [color.r, color.g, color.b, color.a]

interface Props {
  tool: ToolId
  primary: Rgba
  secondary: Rgba
  brushSize: number
  opacity: number
  shapeKind: ShapeKind
  shapeFill: ShapeFill
}

function setup(initial: Partial<Props> = {}) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const onDocumentChange = vi.fn()
  let props: Props = {
    tool: 'shape',
    primary: BLACK,
    secondary: WHITE,
    brushSize: 1,
    opacity: 100,
    shapeKind: 'rectangle',
    shapeFill: 'outline',
    ...initial,
  }
  const element = () => (
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool={props.tool}
      primary={props.primary}
      secondary={props.secondary}
      brushSize={props.brushSize}
      opacity={props.opacity}
      brush="round"
      shapeFill={props.shapeFill}
      shapeKind={props.shapeKind}
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onDocumentChange={onDocumentChange}
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
  const image = () => {
    const shownImage = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray }
    return Array.from(shownImage.data)
  }
  const drag = (from: [number, number], to: [number, number]) => {
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: from[0], clientY: from[1] })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: to[0], clientY: to[1] })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: to[0], clientY: to[1] })
  }
  const commit = () => act(() => fireEvent.keyDown(window, { key: 'Enter' }))
  const click = (x: number, y: number) => {
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: x, clientY: y })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: x, clientY: y })
  }
  return { ref, shown, image, drag, click, setProps, commit, onHistoryChange, onDocumentChange }
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

  it('re-renders a pending rounded callout when its radius handle moves, keeping it through a restyle', () => {
    const { shown, drag, setProps, commit } = setup({ shapeKind: 'callout-rounded-rectangle' })
    drag([5, 5], [25, 25])
    expect(shown(5, 5)).toEqual(rgbaOf(WHITE))
    // The radius handle sits at the body corner inset by the default radius (about 3px).
    drag([8, 8], [5, 5])
    expect(shown(5, 5)).toEqual(rgbaOf(BLACK))
    setProps({ primary: RED })
    expect(shown(5, 5)).toEqual(rgbaOf(RED))
    commit()
    expect(shown(5, 5)).toEqual(rgbaOf(RED))
  })
})

describe('PaintCanvas pending shape is committed when the tool changes', () => {
  it('draws the pending shape as one undo step when another tool is picked', () => {
    const { ref, shown, drag, setProps, onHistoryChange, onDocumentChange } = setup()
    drag([5, 5], [25, 25])
    expect(onDocumentChange).not.toHaveBeenCalled()
    setProps({ tool: 'brush' })
    expect(shown(5, 15)).toEqual(rgbaOf(BLACK))
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    expect(onDocumentChange).toHaveBeenCalledTimes(1)
    expect(ref.current?.hasPendingShape()).toBe(false)
    act(() => ref.current?.undo())
    expect(shown(5, 15)).toEqual(rgbaOf(WHITE))
  })

  it('commits the pending shape with its current style', () => {
    const { shown, drag, setProps } = setup()
    drag([5, 5], [25, 25])
    setProps({ primary: RED })
    setProps({ tool: 'pencil' })
    expect(shown(5, 15)).toEqual(rgbaOf(RED))
  })

  it('commits the pending shape when another shape kind is picked', () => {
    const { ref, shown, drag, setProps, onHistoryChange } = setup()
    drag([5, 5], [25, 25])
    setProps({ shapeKind: 'ellipse' })
    expect(shown(5, 15)).toEqual(rgbaOf(BLACK))
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    expect(ref.current?.hasPendingShape()).toBe(false)
  })

  it('commits a pending curve when another tool is picked', () => {
    const { shown, drag, setProps, onHistoryChange } = setup({ shapeKind: 'polyline' })
    drag([5, 15], [25, 15])
    setProps({ tool: 'fill' })
    expect(shown(15, 15)).toEqual(rgbaOf(BLACK))
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('commits a freeform shape in progress when another tool is picked', () => {
    const { shown, click, setProps, onHistoryChange } = setup({ shapeKind: 'freeform' })
    click(5, 15)
    click(25, 15)
    setProps({ tool: 'brush' })
    expect(shown(15, 15)).toEqual(rgbaOf(BLACK))
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('commits the pending shape when the active layer changes', () => {
    const { ref, shown, drag } = setup()
    drag([5, 5], [25, 25])
    act(() => ref.current?.addLayer())
    expect(shown(5, 15)).toEqual(rgbaOf(BLACK))
    act(() => ref.current?.selectLayer(0))
    expect(shown(5, 15)).toEqual(rgbaOf(BLACK))
  })

  it('still discards the pending shape on Escape', () => {
    const { ref, shown, drag, onHistoryChange } = setup()
    drag([5, 5], [25, 25])
    onHistoryChange.mockClear()
    act(() => fireEvent.keyDown(window, { key: 'Escape' }))
    expect(shown(5, 15)).toEqual(rgbaOf(WHITE))
    expect(onHistoryChange).not.toHaveBeenCalled()
    expect(ref.current?.hasPendingShape()).toBe(false)
  })
})

describe('PaintCanvas pending shape keeps its own style when committed by a tool change', () => {
  // Size and opacity belong to each tool in the app, so picking another tool also
  // hands the canvas that tool's settings; none of them may restyle the shape.
  const style: Partial<Props> = { brushSize: 5, opacity: 60, shapeFill: 'outline-filled', secondary: GREEN }

  const viaEnter = (initial: Partial<Props>, place: (s: ReturnType<typeof setup>) => void) => {
    const s = setup({ ...style, ...initial })
    place(s)
    s.commit()
    return s.image()
  }

  const viaSwitch = (initial: Partial<Props>, place: (s: ReturnType<typeof setup>) => void, next: Partial<Props>) => {
    const s = setup({ ...style, ...initial })
    place(s)
    s.setProps(next)
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    return s.image()
  }

  const rectangle = (s: ReturnType<typeof setup>) => s.drag([5, 5], [25, 25])

  it.each<[string, Partial<Props>]>([
    ['pencil', { tool: 'pencil', brushSize: 1, opacity: 100 }],
    ['brush', { tool: 'brush', brushSize: 2, opacity: 100 }],
    ['eraser', { tool: 'eraser', brushSize: 9, opacity: 30 }],
    ['fill', { tool: 'fill' }],
    ['another shape kind', { shapeKind: 'ellipse' }],
  ])('commits a pending rectangle as previewed when switching to %s', (_name, next) => {
    expect(viaSwitch({}, rectangle, next)).toEqual(viaEnter({}, rectangle))
  })

  it.each<[string, Partial<Props>]>([
    ['pencil', { tool: 'pencil', brushSize: 1, opacity: 100 }],
    ['another shape kind', { shapeKind: 'rectangle' }],
  ])('commits a pending curve as previewed when switching to %s', (_name, next) => {
    const curve = (s: ReturnType<typeof setup>) => s.drag([5, 15], [25, 20])
    expect(viaSwitch({ shapeKind: 'polyline' }, curve, next)).toEqual(viaEnter({ shapeKind: 'polyline' }, curve))
  })
})
