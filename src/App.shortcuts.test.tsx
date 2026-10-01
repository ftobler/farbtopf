import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

/** What each canvas last showed, so the image on screen can be read back pixel by pixel. */
const shown = new WeakMap<HTMLCanvasElement, ImageData>()
const { getContext } = HTMLCanvasElement.prototype

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
    const context = getContext.apply(this, args) as CanvasRenderingContext2D
    context.putImageData = (image: ImageData) => {
      shown.set(this, image)
    }
    return context
  } as typeof getContext
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = getContext
  vi.restoreAllMocks()
  delete window.showOpenFilePicker
})

const BLACK = [0, 0, 0, 255]
const WHITE = [255, 255, 255, 255]

/** Renders the app with the 800×600 image laid out at (100, 100) on screen, at 100 %. */
function setup() {
  const { container } = render(<App />)
  const canvas = container.querySelector('.paint-canvas') as HTMLCanvasElement
  canvas.getBoundingClientRect = () =>
    ({ x: 100, y: 100, left: 100, top: 100, right: 900, bottom: 700, width: 800, height: 600, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()

  const pixel = (x: number, y: number) => {
    const image = shown.get(canvas)
    if (!image) throw new Error('nothing painted yet')
    const offset = (y * image.width + x) * 4
    return Array.from(image.data.slice(offset, offset + 4))
  }
  /** Fills the whole (white) image with the primary colour, black. */
  const paintBlack = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Fill with color' }))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 150, clientY: 150 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 150, clientY: 150 })
    expect(pixel(0, 0)).toEqual(BLACK)
  }
  /** Selects the 120×45 rectangle at (10, 20). */
  const select = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 110, clientY: 120 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 229, clientY: 164 })
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 229, clientY: 164 })
    expect(selectionSize()).toBe('120 × 45 px')
  }
  return { pixel, paintBlack, select }
}

const press = (key: string, options: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) =>
  fireEvent.keyDown(window, { key, ...options })
const ctrl = (key: string, shiftKey = false) => press(key, { ctrlKey: true, shiftKey })

const selectionSize = () => screen.getByLabelText('Selection size').textContent
const zoomLabel = () => document.querySelector('.zoom-label')?.textContent
const gridOn = () => screen.getByRole('button', { name: 'Toggle pixel grid' }).getAttribute('aria-pressed') === 'true'
const primary = () => (screen.getByLabelText('Primary color') as HTMLInputElement).value
const secondary = () => (screen.getByLabelText('Secondary color') as HTMLInputElement).value
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true'

describe('App keyboard shortcuts', () => {
  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z or Ctrl+Y', () => {
    const { pixel, paintBlack } = setup()
    paintBlack()
    ctrl('z')
    expect(pixel(0, 0)).toEqual(WHITE)
    ctrl('Z', true)
    expect(pixel(0, 0)).toEqual(BLACK)
    ctrl('z')
    expect(pixel(0, 0)).toEqual(WHITE)
    ctrl('y')
    expect(pixel(0, 0)).toEqual(BLACK)
  })

  it('takes Cmd as well as Ctrl', () => {
    const { pixel, paintBlack } = setup()
    paintBlack()
    press('z', { metaKey: true })
    expect(pixel(0, 0)).toEqual(WHITE)
  })

  it('saves with Ctrl+S', async () => {
    setup()
    await act(async () => {
      ctrl('s')
    })
    await waitFor(() => expect(screen.getByText('Saved farbtopf.png')).toBeTruthy())
  })

  it('opens an image with Ctrl+O', async () => {
    setup()
    window.showOpenFilePicker = vi.fn(async () => {
      throw new DOMException('cancel', 'AbortError')
    })
    await act(async () => {
      ctrl('o')
    })
    expect(window.showOpenFilePicker).toHaveBeenCalledTimes(1)
  })

  it('opens the new image dialog with Ctrl+N', () => {
    setup()
    expect(screen.queryByRole('dialog', { name: 'New image' })).toBeNull()
    ctrl('n')
    expect(screen.getByRole('dialog', { name: 'New image' })).toBeTruthy()
  })

  it('selects everything with Ctrl+A and switches to the select tool', () => {
    setup()
    expect(pressed('Select')).toBe(false)
    ctrl('a')
    expect(pressed('Select')).toBe(true)
    expect(selectionSize()).toBe('800 × 600 px')
  })

  it('zooms in with + or = and out with -', () => {
    setup()
    expect(zoomLabel()).toBe('100%')
    press('+')
    expect(zoomLabel()).toBe('150%')
    press('=')
    expect(zoomLabel()).toBe('200%')
    press('-')
    expect(zoomLabel()).toBe('150%')
    press('-')
    press('-')
    expect(zoomLabel()).toBe('75%')
  })

  it('swaps the primary and secondary colours with X', () => {
    setup()
    expect([primary(), secondary()]).toEqual(['#000000', '#ffffff'])
    press('x')
    expect([primary(), secondary()]).toEqual(['#ffffff', '#000000'])
    press('X')
    expect([primary(), secondary()]).toEqual(['#000000', '#ffffff'])
  })

  it('toggles the pixel grid with G', () => {
    setup()
    expect(gridOn()).toBe(false)
    press('g')
    expect(gridOn()).toBe(true)
    press('g')
    expect(gridOn()).toBe(false)
  })

  it('deletes the selection with Delete', () => {
    const { pixel, paintBlack, select } = setup()
    paintBlack()
    select()
    press('Delete')
    expect(pixel(10, 20)).toEqual(WHITE)
    expect(pixel(129, 64)).toEqual(WHITE)
    expect(pixel(9, 20)).toEqual(BLACK)
    expect(pixel(130, 64)).toEqual(BLACK)
    expect(selectionSize()).toBe('')
  })

  describe('while Alt is held', () => {
    it('does not switch tools with tool-letter shortcuts', () => {
      setup()
      expect(pressed('Brush')).toBe(true)
      press('f', { altKey: true })
      expect(pressed('Fill with color')).toBe(false)
      expect(pressed('Brush')).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'Eraser' }))
      expect(pressed('Eraser')).toBe(true)
      press('b', { altKey: true })
      expect(pressed('Brush')).toBe(false)
      expect(pressed('Eraser')).toBe(true)
    })

    it('still switches tools with the same letters without Alt', () => {
      setup()
      expect(pressed('Brush')).toBe(true)
      press('f')
      expect(pressed('Fill with color')).toBe(true)
      press('b')
      expect(pressed('Brush')).toBe(true)
    })

    it('does not delete the selection with Alt+Delete', () => {
      const { pixel, paintBlack, select } = setup()
      paintBlack()
      select()
      press('Delete', { altKey: true })
      expect(selectionSize()).toBe('120 × 45 px')
      expect(pixel(10, 20)).toEqual(BLACK)
    })

    it('does not run the other plain shortcuts', () => {
      setup()
      expect(gridOn()).toBe(false)
      press('g', { altKey: true })
      expect(gridOn()).toBe(false)
      press('x', { altKey: true })
      expect([primary(), secondary()]).toEqual(['#000000', '#ffffff'])
      press('+', { altKey: true })
      expect(zoomLabel()).toBe('100%')
    })
  })

  describe('while typing in a field', () => {
    let field: HTMLTextAreaElement
    beforeEach(() => {
      field = document.createElement('textarea')
      document.body.appendChild(field)
    })
    afterEach(() => field.remove())

    it('leaves single keys to the field', () => {
      setup()
      for (const key of ['g', 'x', '+', '-', ']', 'e', 'Delete']) fireEvent.keyDown(field, { key })
      expect(gridOn()).toBe(false)
      expect(primary()).toBe('#000000')
      expect(zoomLabel()).toBe('100%')
      expect(pressed('Brush')).toBe(true)
      expect(screen.getByRole('slider', { name: 'Size' }).getAttribute('aria-valuetext')).toBe('4 px')
    })

    it('leaves Ctrl shortcuts to the field', () => {
      const { pixel, paintBlack } = setup()
      paintBlack()
      fireEvent.keyDown(field, { key: 'z', ctrlKey: true })
      expect(pixel(0, 0)).toEqual(BLACK)
      fireEvent.keyDown(field, { key: 'n', ctrlKey: true })
      fireEvent.keyDown(field, { key: 'a', ctrlKey: true })
      expect(screen.queryByRole('dialog', { name: 'New image' })).toBeNull()
      expect(selectionSize()).toBe('')
    })

    it('leaves keys to an input as well', () => {
      setup()
      fireEvent.keyDown(screen.getByLabelText('Primary color'), { key: 'g' })
      expect(gridOn()).toBe(false)
    })
  })

  describe('while a modal dialog is open', () => {
    it('keeps the current tool when a tool letter is pressed', () => {
      setup()
      fireEvent.click(screen.getByRole('button', { name: 'Eraser' }))
      expect(pressed('Eraser')).toBe(true)
      ctrl('n')
      expect(screen.getByRole('dialog', { name: 'New image' })).toBeTruthy()
      press('b')
      expect(pressed('Eraser')).toBe(true)
      expect(pressed('Brush')).toBe(false)
      expect(screen.getByRole('dialog', { name: 'New image' })).toBeTruthy()
    })

    it('does not delete the selection with Delete', () => {
      const { select } = setup()
      select()
      ctrl('n')
      expect(screen.getByRole('dialog', { name: 'New image' })).toBeTruthy()
      press('Delete')
      expect(selectionSize()).toBe('120 × 45 px')
      expect(screen.getByRole('dialog', { name: 'New image' })).toBeTruthy()
    })

    it('does not undo with Ctrl+Z', () => {
      const { pixel, paintBlack } = setup()
      paintBlack()
      ctrl('n')
      expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeTruthy()
      ctrl('z')
      expect(pixel(0, 0)).toEqual(BLACK)
      expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeTruthy()
    })

    it('closes on Escape and lets shortcuts work again', () => {
      setup()
      ctrl('n')
      expect(screen.getByRole('dialog', { name: 'New image' })).toBeTruthy()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: 'New image' })).toBeNull()
      press('e')
      expect(pressed('Eraser')).toBe(true)
    })
  })
})
