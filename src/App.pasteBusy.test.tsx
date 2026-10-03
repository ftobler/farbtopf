import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitmap } from './core/bitmap'
import { bitmapFromDataUrl, readFileAsDataUrl } from './render/image'
import App from './App'

vi.mock('./render/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./render/image')>()
  return {
    ...actual,
    readFileAsDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA'),
    bitmapFromDataUrl: vi.fn(async () => new Bitmap(40, 30, { r: 255, g: 0, b: 0, a: 255 })),
  }
})

type ClipboardItems = { types: string[]; getType: (type: string) => Promise<Blob> }[]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function stubClipboard(read: () => Promise<ClipboardItems>) {
  const spy = vi.fn(read)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: spy } })
  return spy
}

const imageItems = (): ClipboardItems => [
  { types: ['image/png'], getType: async () => new Blob(['x'], { type: 'image/png' }) },
]

function workspace(container: HTMLElement): HTMLElement {
  return container.querySelector('.workspace') as HTMLElement
}

function loadingShown(): boolean {
  return screen.queryByText('Loading image…') !== null
}

async function clickPaste() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
  })
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('App busy indicator while loading an image', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  })

  it('shows a loading status after a short delay while the clipboard read is pending, and clears it once pasted', async () => {
    const pending = deferred<ClipboardItems>()
    stubClipboard(() => pending.promise)
    const { container } = render(<App />)
    await clickPaste()

    // Not right away, so instant pastes do not flicker.
    expect(loadingShown()).toBe(false)
    await advance(200)
    expect(loadingShown()).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('Loading image…')
    expect(workspace(container).getAttribute('aria-busy')).toBe('true')
    expect(container.querySelector('.app')?.classList.contains('app--busy')).toBe(true)

    pending.resolve(imageItems())
    await advance(100)
    expect(loadingShown()).toBe(false)
    expect(workspace(container).getAttribute('aria-busy')).toBe('false')
    expect(container.querySelector('.app')?.classList.contains('app--busy')).toBe(false)
    expect(screen.getByLabelText('Selection size').textContent).toBe('40 × 30 px')
  })

  it('clears the loading status when reading the clipboard fails', async () => {
    const pending = deferred<ClipboardItems>()
    stubClipboard(() => pending.promise)
    const { container } = render(<App />)
    await clickPaste()
    await advance(200)
    expect(loadingShown()).toBe(true)

    pending.reject(new DOMException('Denied', 'NotAllowedError'))
    await advance(50)
    expect(loadingShown()).toBe(false)
    expect(workspace(container).getAttribute('aria-busy')).toBe('false')
    expect(screen.getByText('Could not paste from the clipboard')).toBeTruthy()
  })

  it('clears the loading status when the clipboard holds no image', async () => {
    const pending = deferred<ClipboardItems>()
    stubClipboard(() => pending.promise)
    render(<App />)
    await clickPaste()
    await advance(200)
    expect(loadingShown()).toBe(true)

    pending.resolve([{ types: ['text/plain'], getType: async () => new Blob(['hi']) }])
    await advance(50)
    expect(loadingShown()).toBe(false)
    expect(screen.getByText('No image in the clipboard')).toBeTruthy()
  })

  it('never shows the loading status for an instant paste', async () => {
    stubClipboard(async () => imageItems())
    render(<App />)
    await clickPaste()
    expect(loadingShown()).toBe(false)
    await advance(1000)
    expect(loadingShown()).toBe(false)
    expect(screen.getByLabelText('Selection size').textContent).toBe('40 × 30 px')
  })

  it('ignores another paste while one is still loading', async () => {
    const pending = deferred<ClipboardItems>()
    const read = stubClipboard(() => pending.promise)
    render(<App />)
    await clickPaste()
    await clickPaste()
    expect(read).toHaveBeenCalledTimes(1)

    pending.resolve(imageItems())
    await advance(100)
    await clickPaste()
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('shows the loading status at once for a large image and lets it paint before decoding', async () => {
    const decode = deferred<Bitmap>()
    vi.mocked(bitmapFromDataUrl).mockImplementationOnce(() => decode.promise)
    render(<App />)
    const big = new File([new Uint8Array(2_000_000)], 'big.png', { type: 'image/png' })
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { items: [{ type: 'image/png', getAsFile: () => big }] } })
    await act(async () => {
      window.dispatchEvent(event)
    })
    // Shown before the usual delay, and decoding waits for a frame to paint it.
    expect(loadingShown()).toBe(true)
    expect(bitmapFromDataUrl).not.toHaveBeenCalled()
    await advance(50)
    expect(bitmapFromDataUrl).toHaveBeenCalled()

    decode.resolve(new Bitmap(40, 30, { r: 0, g: 0, b: 0, a: 255 }))
    await advance(50)
    expect(loadingShown()).toBe(false)
    expect(screen.getByLabelText('Selection size').textContent).toBe('40 × 30 px')
  })

  it('shows the loading status while an opened image file is read', async () => {
    const pending = deferred<string>()
    vi.mocked(readFileAsDataUrl).mockImplementationOnce(() => pending.promise)
    const { container } = render(<App />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'big.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    await advance(200)
    expect(loadingShown()).toBe(true)

    pending.resolve('data:image/png;base64,AAAA')
    await advance(100)
    expect(loadingShown()).toBe(false)
    expect(screen.getByText('Opened big.png')).toBeTruthy()
  })
})
