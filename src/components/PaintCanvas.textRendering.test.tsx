import { createRef } from 'react'
import { fireEvent, render, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import type { Rgba } from '../core/color'
import { BLACK, WHITE } from '../core/color'
import { blitAlpha } from '../core/raster'
import { blendSubpixel } from '../core/textRaster'
import type { TextOptions } from '../render/text'
import { DEFAULT_TEXT_OPTIONS, renderText, renderTextSubpixel } from '../render/text'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const HALF_BLACK: Rgba = { r: 0, g: 0, b: 0, a: 128 }

/** Soft-edged "glyphs" when anti-aliased, hard ones without; the test canvas cannot draw text. */
function softBlock(): Bitmap {
  const bitmap = new Bitmap(10, 4, BLACK)
  for (let y = 0; y < 4; y += 1) bitmap.set(9, y, HALF_BLACK)
  return bitmap
}

const SUBPIXEL = {
  width: 10,
  height: 4,
  data: new Float32Array(10 * 4 * 3).map((_, i) => [1, 0.5, 0.25][i % 3]),
}

vi.mock('../render/text', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/text')>()
  return {
    ...actual,
    renderText: vi.fn((_text: string, options: { antialias: boolean }) =>
      options.antialias ? softBlock() : new Bitmap(10, 4, BLACK),
    ),
    renderTextSubpixel: vi.fn(() => SUBPIXEL),
  }
})

const SIZE = 100

function setup(text: TextOptions = DEFAULT_TEXT_OPTIONS) {
  const ref = createRef<PaintCanvasHandle>()
  const onTextChange = vi.fn()
  const props = {
    ref,
    initialWidth: SIZE,
    initialHeight: SIZE,
    tool: 'text' as const,
    primary: BLACK,
    secondary: WHITE,
    brushSize: 1,
    shapeFill: 'outline' as const,
    zoom: 1,
    showGrid: false,
    onHistoryChange: vi.fn(),
    onCursorMove: vi.fn(),
    onPickColor: vi.fn(),
    onSizeChange: vi.fn(),
    transparentSelection: false,
    onTextChange,
  }
  const { container, rerender } = render(<PaintCanvas {...props} text={text} />)
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  const shownImage = () => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number; height: number }
    return image
  }
  const open = (value = 'hi') => {
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    const textarea = container.querySelector<HTMLTextAreaElement>('.text-editor')
    if (!textarea) throw new Error('text box did not open')
    fireEvent.change(textarea, { target: { value } })
    return textarea
  }
  const commit = (textarea: HTMLTextAreaElement) => fireEvent.keyDown(textarea, { key: 'Enter' })
  const rotateTo = (to: [number, number]) => {
    const handle = container.querySelector<HTMLElement>('.text-rotate-handle')
    if (!handle) throw new Error('no rotate handle')
    handle.setPointerCapture = vi.fn()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: -8, clientY: 27 })
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: to[0], clientY: to[1] })
    fireEvent.pointerUp(handle, { pointerId: 2, clientX: to[0], clientY: to[1] })
  }
  const update = (next: TextOptions) => rerender(<PaintCanvas {...props} text={next} />)
  return { container, open, commit, rotateTo, shownImage, onTextChange, update }
}

/** The 100×100 white canvas the tests start from, as RGBA bytes. */
const blank = () => new Bitmap(SIZE, SIZE, WHITE)

describe('PaintCanvas text rendering options', () => {
  beforeEach(() => {
    vi.mocked(renderText).mockClear()
    vi.mocked(renderTextSubpixel).mockClear()
  })

  it('shows anti-aliasing on and subpixel rendering off in the text toolbar by default', () => {
    const { container, open } = setup()
    open()
    const toolbar = within(container).getByRole('toolbar', { name: 'Text options' })
    expect(within(toolbar).getByRole('button', { name: 'Anti-aliasing' }).getAttribute('aria-pressed')).toBe('true')
    const subpixel = within(toolbar).getByRole('button', { name: 'Subpixel rendering' })
    expect(subpixel.getAttribute('aria-pressed')).toBe('false')
    expect((subpixel as HTMLButtonElement).disabled).toBe(false)
  })

  it('toggles both options through onTextChange and keeps the editor open', () => {
    const { container, open, onTextChange } = setup()
    open()
    fireEvent.click(within(container).getByRole('button', { name: 'Anti-aliasing' }))
    expect(onTextChange).toHaveBeenLastCalledWith({ antialias: false })
    fireEvent.click(within(container).getByRole('button', { name: 'Subpixel rendering' }))
    expect(onTextChange).toHaveBeenLastCalledWith({ subpixel: true })
    expect(container.querySelector('.text-editor')).not.toBeNull()
  })

  it('disables the subpixel toggle while anti-aliasing is off', () => {
    const { container, open, update } = setup()
    open()
    update({ ...DEFAULT_TEXT_OPTIONS, antialias: false, subpixel: true })
    const subpixel = within(container).getByRole('button', { name: 'Subpixel rendering' }) as HTMLButtonElement
    expect(subpixel.disabled).toBe(true)
    expect(within(container).getByRole('button', { name: 'Anti-aliasing' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('stamps the rendered bitmap exactly as before with the default options', () => {
    const { open, commit, shownImage } = setup()
    commit(open())
    expect(renderTextSubpixel).not.toHaveBeenCalled()
    expect(vi.mocked(renderText).mock.lastCall?.[1]).toMatchObject({ antialias: true, subpixel: false })
    const expected = blank()
    blitAlpha(expected, softBlock(), 10, 10)
    expect(Array.from(shownImage().data)).toEqual(Array.from(expected.data))
  })

  it('stamps hard-edged text with anti-aliasing off', () => {
    const { open, commit, shownImage } = setup({ ...DEFAULT_TEXT_OPTIONS, antialias: false })
    commit(open())
    expect(vi.mocked(renderText).mock.lastCall?.[1]).toMatchObject({ antialias: false })
    const expected = blank()
    blitAlpha(expected, new Bitmap(10, 4, BLACK), 10, 10)
    expect(Array.from(shownImage().data)).toEqual(Array.from(expected.data))
  })

  it('blends per channel with subpixel rendering on an upright box', () => {
    const { open, commit, shownImage } = setup({ ...DEFAULT_TEXT_OPTIONS, subpixel: true })
    commit(open())
    expect(renderTextSubpixel).toHaveBeenCalledTimes(1)
    const expected = blank()
    blendSubpixel(expected, SUBPIXEL, 10, 10, BLACK)
    expect(Array.from(shownImage().data)).toEqual(Array.from(expected.data))
  })

  it('falls back to greyscale anti-aliasing when a subpixel text box is turned', () => {
    const { open, commit, rotateTo } = setup({ ...DEFAULT_TEXT_OPTIONS, subpixel: true })
    const textarea = open()
    rotateTo([95, 60])
    commit(textarea)
    expect(renderTextSubpixel).not.toHaveBeenCalled()
    expect(renderText).toHaveBeenCalledTimes(1)
  })

  it('keeps turned text hard-edged with anti-aliasing off', () => {
    const { open, commit, rotateTo, shownImage } = setup({ ...DEFAULT_TEXT_OPTIONS, antialias: false })
    const textarea = open()
    rotateTo([95, 60])
    commit(textarea)
    const { data } = shownImage()
    let ink = 0
    for (let i = 0; i < data.length; i += 4) {
      const pixel = [data[i], data[i + 1], data[i + 2], data[i + 3]]
      expect(pixel[3]).toBe(255)
      expect([0, 255]).toContain(pixel[0])
      expect(pixel[0] === pixel[1] && pixel[1] === pixel[2]).toBe(true)
      if (pixel[0] === 0) ink += 1
    }
    expect(ink).toBeGreaterThan(0)
  })
})
