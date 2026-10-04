import { createRef } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import type { Rgba } from '../core/color'
import { BLACK, WHITE } from '../core/color'
import { DEFAULT_TEXT_OPTIONS } from '../render/text'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }

// The test canvas cannot rasterise glyphs, so the "text" is a solid 10×4 block
// at the top-left of the box: enough to see where and how it lands.
vi.mock('../render/text', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/text')>()
  return { ...actual, renderText: vi.fn(() => new Bitmap(10, 4, RED)) }
})

const SIZE = 100
const rgbaOf = (color: Rgba) => [color.r, color.g, color.b, color.a]

/**
 * A click at (10,10) opens a box 90 wide and 34 tall (one 24px line), so its
 * centre is (55,27).
 */
function setup() {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool="text"
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      transparentSelection={false}
      text={DEFAULT_TEXT_OPTIONS}
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

  const editor = () => container.querySelector<HTMLTextAreaElement>('.text-editor')
  const overlay = () => container.querySelector<HTMLElement>('.text-overlay')
  const open = (value = 'hi') => {
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    const textarea = editor()
    if (!textarea) throw new Error('text box did not open')
    fireEvent.change(textarea, { target: { value } })
    return textarea
  }
  const dragHandle = (selector: string, from: [number, number], to: [number, number]) => {
    const handle = container.querySelector<HTMLElement>(selector)
    if (!handle) throw new Error(`${selector} not rendered`)
    handle.setPointerCapture = vi.fn()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: from[0], clientY: from[1] })
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: to[0], clientY: to[1] })
    fireEvent.pointerUp(handle, { pointerId: 2, clientX: to[0], clientY: to[1] })
  }
  /** Drags the rotate handle from above the centre to `to`. */
  const rotateTo = (to: [number, number]) => dragHandle('.text-rotate-handle', [55, -8], to)
  return { canvas, container, editor, overlay, open, dragHandle, rotateTo, shown, onHistoryChange }
}

const turn = (element: HTMLElement | null) => {
  const match = /rotate\((-?[\d.e-]+)rad\)/.exec(element?.style.transform ?? '')
  return match ? Number(match[1]) : 0
}

describe('PaintCanvas rotatable text box', () => {
  it('shows a rotate handle like a shape, and starts upright', () => {
    const { container, open, editor, overlay } = setup()
    open()
    const handle = container.querySelector('.text-overlay .text-rotate-handle')
    expect(handle).not.toBeNull()
    expect(handle?.classList.contains('shape-rotate-handle')).toBe(true)
    expect(editor()?.style.transform).toBe('')
    expect(overlay()?.style.transform).toBe('')
  })

  it('turns the box about its centre when the rotate handle is dragged, without recording a step', () => {
    const { open, rotateTo, editor, overlay, onHistoryChange } = setup()
    open()
    rotateTo([95, 27])
    expect(turn(editor())).toBeCloseTo(Math.PI / 2, 6)
    expect(turn(overlay())).toBeCloseTo(Math.PI / 2, 6)
    // Both turn about the box centre, in the frame's pixels.
    expect(editor()?.style.transformOrigin).toBe('45px 17px')
    expect(overlay()?.style.transformOrigin).toBe('45px 17px')
    expect(editor()).not.toBeNull()
    expect(onHistoryChange).not.toHaveBeenCalledWith(true, false)
  })

  it('keeps typing into a turned box', () => {
    const { open, rotateTo, editor } = setup()
    const textarea = open()
    rotateTo([95, 27])
    fireEvent.change(textarea, { target: { value: 'hello' } })
    expect(editor()?.value).toBe('hello')
    expect(turn(editor())).toBeCloseTo(Math.PI / 2, 6)
  })

  it('resizes a turned box along its own axes', () => {
    const { open, rotateTo, dragHandle, editor } = setup()
    open()
    rotateTo([95, 27])
    // Turned a quarter clockwise, the box's right edge faces down: its handle sits at (55,72).
    dragHandle('.text-handle-e', [55, 72], [55, 62])
    expect(editor()?.style.width).toBe('80px')
    expect(turn(editor())).toBeCloseTo(Math.PI / 2, 6)
  })

  it('stamps the text at the same angle as the preview', () => {
    const { open, rotateTo, editor, shown, onHistoryChange } = setup()
    const textarea = open()
    rotateTo([55, 90])
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(editor()).toBeNull()
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    // Half a turn about (55,27) carries the block from the top-left to the bottom-right.
    expect(shown(15, 12)).toEqual(rgbaOf(WHITE))
    expect(shown(95, 42)).toEqual(rgbaOf(RED))
    expect(shown(90, 40)).toEqual(rgbaOf(RED))
    expect(shown(99, 43)).toEqual(rgbaOf(RED))
  })

  it('stamps an upright box where it always did', () => {
    const { open, shown } = setup()
    const textarea = open()
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(shown(10, 10)).toEqual(rgbaOf(RED))
    expect(shown(19, 13)).toEqual(rgbaOf(RED))
    expect(shown(20, 13)).toEqual(rgbaOf(WHITE))
  })

  it('discards a turned box on Escape and opens the next one upright', () => {
    const { open, rotateTo, editor, onHistoryChange } = setup()
    const textarea = open()
    rotateTo([55, 90])
    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(editor()).toBeNull()
    expect(onHistoryChange).not.toHaveBeenCalledWith(true, false)
    open()
    expect(turn(editor())).toBe(0)
  })

  it('commits a turned box when the canvas is clicked outside it', () => {
    const { canvas, open, rotateTo, editor, shown } = setup()
    open()
    rotateTo([55, 90])
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 3, clientX: 5, clientY: 90 })
    expect(editor()).toBeNull()
    expect(shown(95, 42)).toEqual(rgbaOf(RED))
  })
})
