import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitmap } from './core/bitmap'
import App from './App'

vi.mock('./render/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./render/image')>()
  return {
    ...actual,
    readFileAsDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA'),
    bitmapFromDataUrl: vi.fn(async () => new Bitmap(40, 30, { r: 255, g: 0, b: 0, a: 255 })),
  }
})

/** What each canvas last showed, so the image on screen can be read back pixel by pixel. */
const shown = new WeakMap<HTMLCanvasElement, ImageData>()

/** What ended up on the clipboard: one record per write, mime type to blob. */
let written: Record<string, Blob>[] = []

class ClipboardItemMock {
  readonly items: Record<string, Blob>
  constructor(items: Record<string, Blob>) {
    this.items = items
  }
}

function setClipboard(value: Partial<Clipboard> | undefined) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}

function writableClipboard() {
  const write = vi.fn(async (items: ClipboardItemMock[]) => {
    written.push(...items.map((item) => item.items))
  })
  setClipboard({ write } as unknown as Partial<Clipboard>)
  return write
}

function failingClipboard() {
  setClipboard({
    write: vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError')
    }),
  } as unknown as Partial<Clipboard>)
}

const { getContext, toDataURL } = HTMLCanvasElement.prototype

beforeEach(() => {
  written = []
  vi.stubGlobal('ClipboardItem', ClipboardItemMock)
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
    const context = getContext.apply(this, args) as CanvasRenderingContext2D
    context.putImageData = (image: ImageData) => {
      shown.set(this, image)
    }
    return context
  } as typeof getContext
  // Encodes the size of the canvas being exported, so a copy shows what it covered.
  HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement) {
    return `data:image/png;base64,${btoa(`${this.width}x${this.height}`)}`
  }
})

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = getContext
  HTMLCanvasElement.prototype.toDataURL = toDataURL
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setClipboard(undefined)
})

/** Renders the app with the 640×400 image laid out at (100, 100) on screen, at 100 %. */
function setup() {
  const { container } = render(<App />)
  const canvas = container.querySelector('.paint-canvas') as HTMLCanvasElement
  canvas.getBoundingClientRect = () =>
    ({ x: 100, y: 100, left: 100, top: 100, right: 740, bottom: 500, width: 640, height: 400, toJSON: () => ({}) }) as DOMRect
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
    expect(screen.getByLabelText('Selection size').textContent).toBe('120 × 45 px')
  }
  return { canvas, pixel, paintBlack, select }
}

const BLACK = [0, 0, 0, 255]
const WHITE = [255, 255, 255, 255]

const press = (key: string) =>
  act(async () => {
    fireEvent.keyDown(window, { key, ctrlKey: true })
  })

/** The native paste event a browser fires for Ctrl+V, with no image on it. */
const paste = () =>
  act(async () => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { items: [] } })
    window.dispatchEvent(event)
  })

async function clickEditItem(label: string) {
  fireEvent.click(screen.getByText('Edit'))
  const item = screen
    .getAllByRole('menuitem')
    .find((entry) => entry.querySelector('.menu-item-label')?.textContent === label)
  if (!item) throw new Error(`No Edit menu item ${label}`)
  await act(async () => {
    fireEvent.click(item)
  })
}

const message = (text: string) => waitFor(() => expect(screen.getByText(text)).toBeTruthy())

describe('App clipboard paste', () => {
  it('says so when the browser cannot read the clipboard', async () => {
    setup()
    await clickEditItem('Paste')
    await message('Clipboard paste is not supported here')
  })

  it('pastes the first image among the clipboard items', async () => {
    const first = vi.fn(async () => new Blob(['a'], { type: 'image/jpeg' }))
    const second = vi.fn(async () => new Blob(['b'], { type: 'image/png' }))
    const text = vi.fn(async () => new Blob(['hello'], { type: 'text/plain' }))
    setClipboard({
      read: vi.fn(async () => [
        { types: ['text/plain'], getType: text },
        { types: ['text/html', 'image/jpeg'], getType: first },
        { types: ['image/png'], getType: second },
      ]),
    } as unknown as Partial<Clipboard>)
    setup()
    await paste()
    await waitFor(() => expect(screen.getByLabelText('Selection size').textContent).toBe('40 × 30 px'))
    expect(first).toHaveBeenCalledWith('image/jpeg')
    expect(second).not.toHaveBeenCalled()
    expect(text).not.toHaveBeenCalled()
  })

  it('says so when the clipboard holds no image', async () => {
    setClipboard({
      read: vi.fn(async () => [{ types: ['text/plain'], getType: vi.fn() }]),
    } as unknown as Partial<Clipboard>)
    setup()
    await clickEditItem('Paste')
    await message('No image in the clipboard')
    expect(screen.getByLabelText('Selection size').textContent).toBe('')
  })

  it('says so when reading the clipboard fails', async () => {
    setClipboard({
      read: vi.fn(async () => {
        throw new DOMException('denied', 'NotAllowedError')
      }),
    } as unknown as Partial<Clipboard>)
    setup()
    await paste()
    await message('Could not paste from the clipboard')
  })
})

describe('App clipboard copy', () => {
  it('says so when the browser cannot write to the clipboard', async () => {
    setup()
    await press('c')
    await message('Clipboard copy is not supported here')
  })

  it('copies the whole image as a PNG without a selection', async () => {
    writableClipboard()
    setup()
    await press('c')
    await message('Copied to the clipboard')
    expect(written).toHaveLength(1)
    expect(Object.keys(written[0])).toEqual(['image/png'])
    expect(await written[0]['image/png'].text()).toBe('640x400')
  })

  it('copies only the selection when there is one', async () => {
    writableClipboard()
    const { select } = setup()
    select()
    await clickEditItem('Copy')
    await message('Copied to the clipboard')
    expect(await written[0]['image/png'].text()).toBe('120x45')
  })

  it('says so when writing to the clipboard fails', async () => {
    failingClipboard()
    setup()
    await press('c')
    await message('Could not copy to the clipboard')
  })

  it('copies without fetching the data URL first', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('fetch must not be called during copy')))
    vi.stubGlobal('fetch', fetchSpy)
    writableClipboard()
    setup()
    await press('c')
    await message('Copied to the clipboard')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await written[0]['image/png'].text()).toBe('640x400')
  })
})

describe('App clipboard cut', () => {
  it('cuts only the selection, leaving the rest of the image', async () => {
    writableClipboard()
    const { pixel, paintBlack, select } = setup()
    paintBlack()
    select()
    await press('x')
    await message('Cut to the clipboard')
    expect(await written[0]['image/png'].text()).toBe('120x45')
    expect(pixel(10, 20)).toEqual(WHITE)
    expect(pixel(129, 64)).toEqual(WHITE)
    expect(pixel(9, 20)).toEqual(BLACK)
    expect(pixel(130, 64)).toEqual(BLACK)
    expect(pixel(10, 65)).toEqual(BLACK)
  })

  it('cuts the whole image without a selection, clearing the canvas', async () => {
    writableClipboard()
    const { pixel, paintBlack } = setup()
    paintBlack()
    await clickEditItem('Cut')
    await message('Cut to the clipboard')
    expect(await written[0]['image/png'].text()).toBe('640x400')
    expect(pixel(0, 0)).toEqual(WHITE)
    expect(pixel(639, 399)).toEqual(WHITE)
  })

  it('leaves the selection untouched when writing to the clipboard fails', async () => {
    failingClipboard()
    const { pixel, paintBlack, select } = setup()
    paintBlack()
    select()
    await press('x')
    await message('Could not cut to the clipboard')
    expect(pixel(10, 20)).toEqual(BLACK)
    expect(screen.getByLabelText('Selection size').textContent).toBe('120 × 45 px')
  })

  it('keeps the image when writing to the clipboard fails without a selection', async () => {
    failingClipboard()
    const { pixel, paintBlack } = setup()
    paintBlack()
    await press('x')
    await message('Could not cut to the clipboard')
    expect(pixel(0, 0)).toEqual(BLACK)
  })

  it('says so when the browser cannot write to the clipboard, keeping the image', async () => {
    const { pixel, paintBlack } = setup()
    paintBlack()
    await press('x')
    await message('Clipboard copy is not supported here')
    expect(pixel(0, 0)).toEqual(BLACK)
  })

  it('cuts without fetching the data URL first', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('fetch must not be called during cut')))
    vi.stubGlobal('fetch', fetchSpy)
    writableClipboard()
    const { pixel, paintBlack } = setup()
    paintBlack()
    await press('x')
    await message('Cut to the clipboard')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await written[0]['image/png'].text()).toBe('640x400')
    expect(pixel(0, 0)).toEqual(WHITE)
  })
})
