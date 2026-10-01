import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bitmap } from './core/bitmap'
import App from './App'

vi.mock('./render/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./render/image')>()
  return {
    ...actual,
    readFileAsDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA'),
    bitmapFromDataUrl: vi.fn(async () => new Bitmap(320, 240, { r: 255, g: 0, b: 0, a: 255 })),
  }
})

function fakeHandle(name: string) {
  const writable = { write: vi.fn(async () => {}), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) }
  return {
    kind: 'file' as const,
    name,
    writable,
    getFile: vi.fn(async () => new File(['x'], name, { type: 'image/png' })),
    createWritable: vi.fn(async () => writable),
    queryPermission: vi.fn(async (): Promise<PermissionState> => 'granted'),
    requestPermission: vi.fn(async (): Promise<PermissionState> => 'granted'),
  }
}
const asHandle = (handle: ReturnType<typeof fakeHandle>) => handle as unknown as FileSystemFileHandle

beforeEach(() => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  delete window.showOpenFilePicker
  delete window.showSaveFilePicker
})

/** True when leaving the page would ask the user to confirm. */
function warnsOnLeave(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

async function clickFileItem(label: string) {
  fireEvent.click(screen.getByText('File'))
  const item = screen
    .getAllByRole('menuitem')
    .find((entry) => entry.querySelector('.menu-item-label')?.textContent === label)
  if (!item) throw new Error(`No File menu item ${label}`)
  await act(async () => {
    fireEvent.click(item)
  })
}

const edit = () => clickFileItem('Clear canvas')
const pressSave = async () => {
  await act(async () => {
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  })
}

describe('App unsaved changes', () => {
  it('lets the page close freely before any change', () => {
    render(<App />)
    expect(warnsOnLeave()).toBe(false)
    expect(document.title).toBe('Farbtopf')
  })

  it('warns before leaving once the image changed and marks the title', async () => {
    render(<App />)
    await edit()
    expect(warnsOnLeave()).toBe(true)
    expect(document.title).toBe('*Farbtopf')
  })

  it('stays dirty after undoing', async () => {
    render(<App />)
    await edit()
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(warnsOnLeave()).toBe(true)
  })

  it('is clean again after saving', async () => {
    render(<App />)
    const handle = fakeHandle('drawing.png')
    window.showSaveFilePicker = vi.fn(async () => asHandle(handle))
    await edit()
    await pressSave()
    await waitFor(() => expect(screen.getByText('Saved drawing.png')).toBeTruthy())
    expect(warnsOnLeave()).toBe(false)
    expect(document.title).toBe('drawing.png - Farbtopf')
  })

  it('stays dirty when saving is cancelled or fails', async () => {
    render(<App />)
    window.showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('cancel', 'AbortError')
    })
    await edit()
    await pressSave()
    expect(warnsOnLeave()).toBe(true)

    const handle = fakeHandle('broken.png')
    handle.createWritable.mockRejectedValue(new Error('disk full'))
    window.showSaveFilePicker = vi.fn(async () => asHandle(handle))
    await pressSave()
    await waitFor(() => expect(screen.getByText('Could not save broken.png')).toBeTruthy())
    expect(warnsOnLeave()).toBe(true)
  })

  it('counts the download fallback of Save as saving', async () => {
    render(<App />)
    await edit()
    await pressSave()
    expect(screen.getByText('Saved farbtopf.png')).toBeTruthy()
    expect(warnsOnLeave()).toBe(false)
  })

  it('stays dirty after Download', async () => {
    render(<App />)
    await edit()
    await clickFileItem('Download PNG')
    expect(screen.getByText('Downloaded farbtopf.png')).toBeTruthy()
    expect(warnsOnLeave()).toBe(true)
  })

  it('is clean after opening an image', async () => {
    render(<App />)
    await edit()
    window.showOpenFilePicker = vi.fn(async () => [asHandle(fakeHandle('photo.png'))])
    await clickFileItem('Open…')
    await waitFor(() => expect(screen.getByText('Opened photo.png')).toBeTruthy())
    expect(warnsOnLeave()).toBe(false)
    expect(document.title).toBe('photo.png - Farbtopf')
  })

  it('marks the file name in the title once an opened image changes', async () => {
    render(<App />)
    window.showOpenFilePicker = vi.fn(async () => [asHandle(fakeHandle('photo.png'))])
    await clickFileItem('Open…')
    await waitFor(() => expect(document.title).toBe('photo.png - Farbtopf'))
    await edit()
    expect(document.title).toBe('*photo.png - Farbtopf')
    expect(warnsOnLeave()).toBe(true)
  })

  it('drops the file name from the title for a new image', async () => {
    render(<App />)
    window.showOpenFilePicker = vi.fn(async () => [asHandle(fakeHandle('photo.png'))])
    await clickFileItem('Open…')
    await waitFor(() => expect(document.title).toBe('photo.png - Farbtopf'))
    await edit()
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(document.title).toBe('Farbtopf')
    await edit()
    expect(document.title).toBe('*Farbtopf')
  })

  it('is clean after creating a new image', async () => {
    render(<App />)
    await edit()
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(warnsOnLeave()).toBe(false)
  })
})

describe('App unsaved changes with something pending', () => {
  function paintCanvas(container: HTMLElement) {
    const canvas = container.querySelector('.paint-canvas') as HTMLCanvasElement
    canvas.setPointerCapture = vi.fn()
    canvas.releasePointerCapture = vi.fn()
    return canvas
  }

  function drawPendingRectangle(container: HTMLElement) {
    fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
    const canvas = paintCanvas(container)
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 1, clientX: 40, clientY: 40 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
  }

  function startFreeform(container: HTMLElement) {
    fireEvent.click(screen.getByRole('button', { name: 'Freeform shape' }))
    const canvas = paintCanvas(container)
    for (const x of [5, 30]) {
      fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: x, clientY: 10 })
      fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: x, clientY: 10 })
    }
  }

  function openTextBox(container: HTMLElement) {
    fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    const canvas = paintCanvas(container)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
    return container.querySelector('.text-editor') as HTMLTextAreaElement
  }

  it('counts a pending shape as unsaved work', () => {
    const { container } = render(<App />)
    drawPendingRectangle(container)
    expect(warnsOnLeave()).toBe(true)
    expect(document.title).toBe('*Farbtopf')
  })

  it('is clean again once the pending shape is discarded with Escape', () => {
    const { container } = render(<App />)
    drawPendingRectangle(container)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(warnsOnLeave()).toBe(false)
    expect(document.title).toBe('Farbtopf')
  })

  it('stays dirty after discarding a pending shape when an earlier edit is unsaved', async () => {
    const { container } = render(<App />)
    await edit()
    drawPendingRectangle(container)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(warnsOnLeave()).toBe(true)
  })

  it('stays dirty once the pending shape is placed', () => {
    const { container } = render(<App />)
    drawPendingRectangle(container)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(warnsOnLeave()).toBe(true)
  })

  it('counts a freeform shape in progress as unsaved work', () => {
    const { container } = render(<App />)
    startFreeform(container)
    expect(warnsOnLeave()).toBe(true)
  })

  it('counts an open text box with text as unsaved work, and is clean once it is discarded', () => {
    const { container } = render(<App />)
    const editor = openTextBox(container)
    expect(warnsOnLeave()).toBe(false)
    fireEvent.change(editor, { target: { value: 'Hello' } })
    expect(warnsOnLeave()).toBe(true)
    expect(document.title).toBe('*Farbtopf')
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(warnsOnLeave()).toBe(false)
  })

  it('is clean after saving with a shape pending', async () => {
    const { container } = render(<App />)
    const handle = fakeHandle('drawing.png')
    window.showSaveFilePicker = vi.fn(async () => asHandle(handle))
    drawPendingRectangle(container)
    await pressSave()
    await waitFor(() => expect(screen.getByText('Saved drawing.png')).toBeTruthy())
    expect(warnsOnLeave()).toBe(false)
  })

  it('is clean after creating a new image over a pending shape', () => {
    const { container } = render(<App />)
    drawPendingRectangle(container)
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(warnsOnLeave()).toBe(false)
  })
})
