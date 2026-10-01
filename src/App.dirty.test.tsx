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

  it('is clean after creating a new image', async () => {
    render(<App />)
    await edit()
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(warnsOnLeave()).toBe(false)
  })
})
