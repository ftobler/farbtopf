import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Rgba } from '../core/color'
import { Bitmap } from '../core/bitmap'
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
  showMiniature: boolean
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
    showMiniature: false,
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
      showMiniature={props.showMiniature}
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
  return { ref, container, shown, image, drag, click, setProps, commit, onHistoryChange, onDocumentChange }
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

describe('PaintCanvas document actions accept the pending shape first', () => {
  type Setup = ReturnType<typeof setup>
  const place = (s: Setup) => s.drag([2, 5], [20, 25])
  const blank = Array.from({ length: SIZE * SIZE }, () => rgbaOf(WHITE)).flat()

  function resizeByHandle(s: Setup) {
    const frame = s.container.querySelector('.canvas-frame') as HTMLElement
    frame.getBoundingClientRect = () =>
      ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
    const handle = s.container.querySelector('.canvas-resize-handle-e') as HTMLElement
    handle.setPointerCapture = vi.fn()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: SIZE, clientY: 10 })
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: SIZE + 6, clientY: 10 })
    fireEvent.pointerUp(handle, { pointerId: 2, clientX: SIZE + 6, clientY: 10 })
  }

  const pasted = () => new Bitmap(4, 4, RED)

  // Each action runs on the image with the shape placed: the result matches placing the
  // shape with Enter first, and undo takes back the action, then the shape.
  it.each<[string, (s: Setup) => void]>([
    ['flip horizontally', (s) => s.ref.current?.flip('horizontal')],
    ['flip vertically', (s) => s.ref.current?.flip('vertical')],
    ['rotate', (s) => s.ref.current?.rotate(90)],
    ['clear', (s) => s.ref.current?.clear()],
    ['scale the image', (s) => s.ref.current?.scale(40, 20)],
    ['resize the canvas', (s) => s.ref.current?.resizeCanvas({ x: 0, y: 0, width: 36, height: 30 })],
    ['drag a canvas resize handle', resizeByHandle],
    ['invert colours', (s) => s.ref.current?.invertColors()],
    ['blur', (s) => s.ref.current?.blur(2)],
    ['paste', (s) => s.ref.current?.pasteBitmap(pasted())],
    ['cut without a selection', (s) => {
      s.ref.current?.toDataUrl()
      s.ref.current?.clear()
    }],
  ])('%s', (_name, action) => {
    const reference = setup()
    place(reference)
    reference.commit()
    const placed = reference.image()
    act(() => action(reference))
    const expected = reference.image()

    const s = setup()
    place(s)
    act(() => action(s))
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.image()).toEqual(expected)
    act(() => s.ref.current?.undo())
    expect(s.image()).toEqual(placed)
    act(() => s.ref.current?.undo())
    expect(s.image()).toEqual(blank)
    expect(s.onHistoryChange).toHaveBeenLastCalledWith(false, true)
  })

  // Actions that leave the image alone still place the shape as one undo step.
  it.each<[string, (s: Setup) => void]>([
    ['save (toDataUrl)', (s) => s.ref.current?.toDataUrl()],
    ['copy', (s) => s.ref.current?.getSelectionDataUrl()],
    ['copy visible', (s) => s.ref.current?.getVisibleDataUrl()],
    ['crop without a selection', (s) => s.ref.current?.cropToSelection()],
    ['cut a missing selection', (s) => s.ref.current?.cutSelection()],
    ['select all', (s) => s.ref.current?.selectAll()],
  ])('%s', (_name, action) => {
    const reference = setup()
    place(reference)
    reference.commit()
    const placed = reference.image()

    const s = setup()
    place(s)
    act(() => action(s))
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.image()).toEqual(placed)
    act(() => s.ref.current?.undo())
    expect(s.image()).toEqual(blank)
    expect(s.onHistoryChange).toHaveBeenLastCalledWith(false, true)
  })

  it('places a pending curve before flipping', () => {
    const reference = setup({ shapeKind: 'polyline' })
    reference.drag([2, 5], [20, 25])
    reference.commit()
    act(() => reference.ref.current?.flip('horizontal'))
    const expected = reference.image()

    const s = setup({ shapeKind: 'polyline' })
    s.drag([2, 5], [20, 25])
    act(() => s.ref.current?.flip('horizontal'))
    expect(s.image()).toEqual(expected)
  })

  it('takes back only the pending shape on undo, and redo brings it back', () => {
    const s = setup()
    s.drag([2, 2], [8, 8])
    s.commit()
    const first = s.image()
    place(s)
    const placed = s.image()
    act(() => s.ref.current?.undo())
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.image()).toEqual(first)
    expect(s.onHistoryChange).toHaveBeenLastCalledWith(true, true)
    act(() => s.ref.current?.redo())
    expect(s.image()).toEqual(placed)
  })

  it('takes back only a lone freeform vertex on undo', () => {
    const s = setup()
    s.drag([2, 2], [8, 8])
    s.commit()
    const first = s.image()
    s.setProps({ shapeKind: 'freeform' })
    s.click(15, 15)
    act(() => s.ref.current?.undo())
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.image()).toEqual(first)
    expect(s.onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('takes back only a shape still being dragged out on undo', () => {
    const s = setup()
    s.drag([2, 2], [8, 8])
    s.commit()
    const first = s.image()
    fireEvent.pointerDown(s.container.querySelector('canvas') as HTMLCanvasElement, { button: 0, buttons: 1, pointerId: 1, clientX: 12, clientY: 12 })
    fireEvent.pointerMove(s.container.querySelector('canvas') as HTMLCanvasElement, { buttons: 1, pointerId: 1, clientX: 25, clientY: 25 })
    act(() => s.ref.current?.undo())
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.image()).toEqual(first)
    expect(s.onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('drops the pending shape on redo', () => {
    const s = setup()
    s.drag([2, 2], [8, 8])
    s.commit()
    const first = s.image()
    act(() => s.ref.current?.undo())
    place(s)
    act(() => s.ref.current?.redo())
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.image()).toEqual(first)
  })

  it('drops a freeform shape in progress on redo, and redoes', () => {
    const s = setup()
    s.drag([2, 2], [8, 8])
    s.commit()
    const first = s.image()
    act(() => s.ref.current?.undo())
    s.setProps({ shapeKind: 'freeform' })
    s.click(5, 15)
    s.click(25, 15)
    act(() => s.ref.current?.redo())
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.image()).toEqual(first)
    expect(s.onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('drops a curve in progress on redo, and redoes', () => {
    const s = setup()
    s.drag([2, 2], [8, 8])
    s.commit()
    const first = s.image()
    act(() => s.ref.current?.undo())
    s.setProps({ shapeKind: 'polyline' })
    s.drag([5, 15], [25, 15])
    act(() => s.ref.current?.redo())
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.image()).toEqual(first)
  })
})

describe('PaintCanvas opening the miniature view', () => {
  it('keeps showing a pending shape', () => {
    const { shown, drag, setProps } = setup()
    drag([5, 5], [25, 25])
    setProps({ showMiniature: true })
    expect(shown(5, 15)).toEqual(rgbaOf(BLACK))
  })

  it('keeps showing a freeform shape in progress', () => {
    const { shown, click, setProps } = setup({ shapeKind: 'freeform' })
    click(5, 15)
    click(25, 15)
    setProps({ showMiniature: true })
    expect(shown(15, 15)).toEqual(rgbaOf(BLACK))
  })

  it('keeps showing a floating selection', () => {
    const { ref, shown, setProps } = setup({ tool: 'select' })
    act(() => ref.current?.pasteBitmap(new Bitmap(4, 4, RED)))
    expect(shown(1, 1)).toEqual(rgbaOf(RED))
    setProps({ showMiniature: true })
    expect(shown(1, 1)).toEqual(rgbaOf(RED))
  })
})

describe('PaintCanvas click on the workspace outside the image', () => {
  it('places a freeform shape in progress as one undo step', () => {
    const { ref, shown, click, onHistoryChange } = setup({ shapeKind: 'freeform' })
    click(5, 15)
    click(25, 15)
    act(() => ref.current?.clickOutside(100, 100))
    expect(ref.current?.hasPendingShape()).toBe(false)
    expect(shown(15, 15)).toEqual(rgbaOf(BLACK))
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })
})
