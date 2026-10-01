import { createRef } from 'react'
import { fireEvent, render, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../core/color'
import type { TextOptions } from '../render/text'
import { DEFAULT_TEXT_OPTIONS } from '../render/text'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 100

function setup(text: Partial<TextOptions> = {}) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const onTextChange = vi.fn()
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
      text={{ ...DEFAULT_TEXT_OPTIONS, ...text }}
      onTextChange={onTextChange}
    />,
  )
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()

  const editor = () => container.querySelector<HTMLTextAreaElement>('.text-editor')
  /** Opens a text box with a click and types `value` into it. */
  const type = (value: string) => {
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    const textarea = editor()
    if (!textarea) throw new Error('text box did not open')
    fireEvent.change(textarea, { target: { value } })
    return textarea
  }
  const sizeInput = () => within(container).getByLabelText('Text size')
  const button = (name: string) => within(container).getByRole('button', { name })
  return { ref, container, editor, type, sizeInput, button, onHistoryChange, onTextChange }
}

/** Every string drawn with fillText on any canvas context created so far. */
function drawnText(): string[] {
  const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext)
  return getContext.mock.results.flatMap((result) => {
    const context = result.value as { fillText?: { mock?: { calls: unknown[][] } } } | null
    return context?.fillText?.mock?.calls.map((call) => String(call[0])) ?? []
  })
}

describe('PaintCanvas text box toolbar', () => {
  it('sets the text size from the size field, rounded and capped at 200', () => {
    const { type, sizeInput, onTextChange } = setup()
    type('hi')
    fireEvent.change(sizeInput(), { target: { value: '36' } })
    expect(onTextChange).toHaveBeenLastCalledWith({ fontSize: 36 })
    fireEvent.change(sizeInput(), { target: { value: '13.6' } })
    expect(onTextChange).toHaveBeenLastCalledWith({ fontSize: 14 })
    fireEvent.change(sizeInput(), { target: { value: '500' } })
    expect(onTextChange).toHaveBeenLastCalledWith({ fontSize: 200 })
  })

  it('ignores an empty, zero or negative text size', () => {
    const { type, sizeInput, onTextChange } = setup({ fontSize: 30 })
    type('hi')
    for (const value of ['', '0', '-4']) fireEvent.change(sizeInput(), { target: { value } })
    expect(onTextChange).not.toHaveBeenCalled()
  })

  it('shows the current size and style options', () => {
    const { type, sizeInput, button } = setup({ fontSize: 42, bold: true, underline: true })
    type('hi')
    expect((sizeInput() as HTMLInputElement).value).toBe('42')
    expect(button('Bold').getAttribute('aria-pressed')).toBe('true')
    expect(button('Italic').getAttribute('aria-pressed')).toBe('false')
    expect(button('Underline').getAttribute('aria-pressed')).toBe('true')
  })

  it('toggles bold, italic and underline from their current state', () => {
    const { type, button, onTextChange } = setup({ bold: true, italic: false, underline: false })
    type('hi')
    fireEvent.click(button('Bold'))
    expect(onTextChange).toHaveBeenLastCalledWith({ bold: false })
    fireEvent.click(button('Italic'))
    expect(onTextChange).toHaveBeenLastCalledWith({ italic: true })
    fireEvent.click(button('Underline'))
    expect(onTextChange).toHaveBeenLastCalledWith({ underline: true })
  })
})

describe('PaintCanvas text box keys', () => {
  beforeEach(() => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockClear()
  })

  it('places the text on Enter', () => {
    const { type, editor, onHistoryChange } = setup()
    const textarea = type('hello')
    const notPrevented = fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(notPrevented).toBe(false)
    expect(editor()).toBeNull()
    expect(drawnText()).toContain('hello')
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
  })

  it('keeps editing on Shift+Enter so a line break can be typed', () => {
    const { type, editor, onHistoryChange } = setup()
    const textarea = type('hello')
    const notPrevented = fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(notPrevented).toBe(true)
    expect(editor()).not.toBeNull()
    expect(onHistoryChange).not.toHaveBeenCalledWith(true, false)
  })

  it('discards the text on Escape without painting it', () => {
    const { type, editor, onHistoryChange } = setup()
    const textarea = type('hello')
    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(editor()).toBeNull()
    expect(drawnText()).not.toContain('hello')
    expect(onHistoryChange).not.toHaveBeenCalledWith(true, false)
  })

  it('closes an empty text box on Enter without recording a step', () => {
    const { type, editor, onHistoryChange } = setup()
    const textarea = type('   ')
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(editor()).toBeNull()
    expect(onHistoryChange).not.toHaveBeenCalledWith(true, false)
  })
})
