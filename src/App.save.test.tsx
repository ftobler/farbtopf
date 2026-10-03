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

function fakeHandle(name: string, type = 'image/png') {
  const writes: Blob[] = []
  const writable = {
    write: vi.fn(async (blob: Blob) => {
      writes.push(blob)
    }),
    close: vi.fn(async () => {}),
  }
  return {
    kind: 'file' as const,
    name,
    writes,
    getFile: vi.fn(async () => new File(['x'], name, { type })),
    createWritable: vi.fn(async () => writable),
    queryPermission: vi.fn(async (): Promise<PermissionState> => 'granted'),
    requestPermission: vi.fn(async (): Promise<PermissionState> => 'granted'),
  }
}
type FakeHandle = ReturnType<typeof fakeHandle>
const asHandle = (handle: FakeHandle) => handle as unknown as FileSystemFileHandle

const abort = () => new DOMException('The user aborted a request.', 'AbortError')

let downloads: string[]

beforeEach(() => {
  downloads = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  delete window.showOpenFilePicker
  delete window.showSaveFilePicker
})

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

const pressSave = () => fireEvent.keyDown(window, { key: 's', ctrlKey: true })

async function openWithPicker(handle: FakeHandle) {
  window.showOpenFilePicker = vi.fn(async () => [asHandle(handle)])
  await clickFileItem('Open…')
  await waitFor(() => expect(screen.getByText(`Opened ${handle.name}`)).toBeTruthy())
}

describe('App save', () => {
  it('lists save, save as and download in the File menu', () => {
    render(<App />)
    fireEvent.click(screen.getByText('File'))
    const labels = screen.getAllByRole('menuitem').map((item) => item.querySelector('.menu-item-label')?.textContent)
    expect(labels).toEqual(['New', 'Open…', 'Save', 'Save as…', 'Download PNG', 'Clear canvas'])
  })

  it('opens through the file picker and saves back to the same file', async () => {
    render(<App />)
    const handle = fakeHandle('photo.png')
    await openWithPicker(handle)
    await waitFor(() => expect(screen.getByText('320 × 240 px')).toBeTruthy())

    window.showSaveFilePicker = vi.fn()
    await act(async () => {
      pressSave()
    })
    await waitFor(() => expect(screen.getByText('Saved photo.png')).toBeTruthy())
    expect(handle.writes).toHaveLength(1)
    expect(handle.writes[0].type).toBe('image/png')
    expect(window.showSaveFilePicker).not.toHaveBeenCalled()
    expect(downloads).toEqual([])
  })

  it('shows the open file name in the window title', async () => {
    render(<App />)
    expect(document.title).toBe('Farbtopf')
    await openWithPicker(fakeHandle('photo.png'))
    expect(document.title).toBe('photo.png - Farbtopf')
  })

  it('encodes in the format of the opened file', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
      (type?: string) => `data:${type ?? 'image/png'};base64,`,
    )
    render(<App />)
    const handle = fakeHandle('photo.jpg', 'image/jpeg')
    await openWithPicker(handle)
    await act(async () => {
      pressSave()
    })
    await waitFor(() => expect(handle.writes).toHaveLength(1))
    expect(handle.writes[0].type).toBe('image/jpeg')
  })

  it('does not overwrite an opened bmp with png data and saves as png instead', async () => {
    render(<App />)
    const handle = fakeHandle('logo.bmp', 'image/bmp')
    await openWithPicker(handle)
    const png = fakeHandle('logo.png')
    window.showSaveFilePicker = vi.fn(async () => asHandle(png))
    await act(async () => {
      pressSave()
    })
    await waitFor(() => expect(screen.getByText('Saved logo.png')).toBeTruthy())
    expect(handle.writes).toHaveLength(0)
    expect(vi.mocked(window.showSaveFilePicker).mock.calls[0][0]?.suggestedName).toBe('logo.png')
    expect(png.writes).toHaveLength(1)
    expect(png.writes[0].type).toBe('image/png')
  })

  it('downloads a png when saving an opened bmp without the save picker', async () => {
    render(<App />)
    const handle = fakeHandle('logo.bmp', 'image/bmp')
    await openWithPicker(handle)
    await act(async () => {
      pressSave()
    })
    expect(downloads).toEqual(['logo.png'])
    expect(handle.writes).toHaveLength(0)
    expect(screen.getByText('Saved logo.png')).toBeTruthy()
  })

  it('saves an opened jpg back to the same handle without asking', async () => {
    render(<App />)
    const handle = fakeHandle('photo.jpg', 'image/jpeg')
    await openWithPicker(handle)
    window.showSaveFilePicker = vi.fn()
    await act(async () => {
      pressSave()
    })
    await waitFor(() => expect(handle.writes).toHaveLength(1))
    expect(window.showSaveFilePicker).not.toHaveBeenCalled()
  })

  it('does nothing when the open picker is cancelled', async () => {
    render(<App />)
    window.showOpenFilePicker = vi.fn(async () => {
      throw abort()
    })
    await clickFileItem('Open…')
    expect(document.querySelector('.toast')).toBeNull()
    expect(screen.getByText('640 × 400 px')).toBeTruthy()
  })

  it('falls back to the file input without the picker', async () => {
    render(<App />)
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    await clickFileItem('Open…')
    expect(click).toHaveBeenCalled()
  })

  it('asks where to save a new image and keeps that file for the next save', async () => {
    render(<App />)
    const handle = fakeHandle('drawing.png')
    window.showSaveFilePicker = vi.fn(async () => asHandle(handle))
    await act(async () => {
      pressSave()
    })
    await waitFor(() => expect(screen.getByText('Saved drawing.png')).toBeTruthy())
    expect(vi.mocked(window.showSaveFilePicker).mock.calls[0][0]?.suggestedName).toBe('farbtopf.png')
    expect(handle.writes).toHaveLength(1)
    expect(document.title).toBe('drawing.png - Farbtopf')

    await act(async () => {
      pressSave()
    })
    await waitFor(() => expect(handle.writes).toHaveLength(2))
    expect(window.showSaveFilePicker).toHaveBeenCalledTimes(1)
  })

  it('save as always asks and then saves to the new file', async () => {
    render(<App />)
    const opened = fakeHandle('photo.png')
    await openWithPicker(opened)
    const copy = fakeHandle('copy.png')
    window.showSaveFilePicker = vi.fn(async () => asHandle(copy))
    await clickFileItem('Save as…')
    await waitFor(() => expect(screen.getByText('Saved copy.png')).toBeTruthy())
    expect(vi.mocked(window.showSaveFilePicker).mock.calls[0][0]?.suggestedName).toBe('photo.png')

    await act(async () => {
      pressSave()
    })
    await waitFor(() => expect(copy.writes).toHaveLength(2))
    expect(opened.writes).toHaveLength(0)
  })

  it('stays quiet when the save picker is cancelled', async () => {
    render(<App />)
    window.showSaveFilePicker = vi.fn(async () => {
      throw abort()
    })
    await act(async () => {
      pressSave()
    })
    expect(window.showSaveFilePicker).toHaveBeenCalled()
    expect(document.querySelector('.toast')).toBeNull()
    expect(downloads).toEqual([])
  })

  it('reports a denied write permission', async () => {
    render(<App />)
    const handle = fakeHandle('photo.png')
    handle.queryPermission.mockResolvedValue('prompt')
    handle.requestPermission.mockResolvedValue('denied')
    await openWithPicker(handle)
    await act(async () => {
      pressSave()
    })
    await waitFor(() => expect(screen.getByText('Permission to save photo.png was denied')).toBeTruthy())
    expect(handle.writes).toHaveLength(0)
  })

  it('reports a failed write', async () => {
    render(<App />)
    const handle = fakeHandle('photo.png')
    handle.createWritable.mockRejectedValue(new Error('disk full'))
    await openWithPicker(handle)
    await act(async () => {
      pressSave()
    })
    await waitFor(() => expect(screen.getByText('Could not save photo.png')).toBeTruthy())
  })

  it('downloads instead when the browser cannot save files', async () => {
    render(<App />)
    await act(async () => {
      pressSave()
    })
    expect(downloads).toEqual(['farbtopf.png'])
    expect(screen.getByText('Saved farbtopf.png')).toBeTruthy()
  })

  it('downloads a png named after the opened file', async () => {
    render(<App />)
    const handle = fakeHandle('photo.jpg', 'image/jpeg')
    await openWithPicker(handle)
    await clickFileItem('Download PNG')
    expect(downloads).toEqual(['photo.png'])
    expect(handle.writes).toHaveLength(0)
    expect(screen.getByText('Downloaded photo.png')).toBeTruthy()
  })

  it('saves a dropped file back through its handle', async () => {
    render(<App />)
    const handle = fakeHandle('dropped.png')
    const file = new File(['x'], 'dropped.png', { type: 'image/png' })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', {
      value: {
        types: ['Files'],
        files: [file],
        items: [{ kind: 'file', type: 'image/png', getAsFileSystemHandle: async () => handle }],
        dropEffect: 'none',
      },
    })
    await act(async () => {
      window.dispatchEvent(drop)
    })
    await waitFor(() => expect(screen.getByText('Opened dropped.png')).toBeTruthy())
    window.showSaveFilePicker = vi.fn()
    await act(async () => {
      pressSave()
    })
    await waitFor(() => expect(handle.writes).toHaveLength(1))
    expect(window.showSaveFilePicker).not.toHaveBeenCalled()
  })

  it('starts without a file after New', async () => {
    render(<App />)
    await openWithPicker(fakeHandle('photo.png'))
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(document.title).toBe('Farbtopf')
    const fresh = fakeHandle('new.png')
    window.showSaveFilePicker = vi.fn(async () => asHandle(fresh))
    await act(async () => {
      pressSave()
    })
    await waitFor(() => expect(fresh.writes).toHaveLength(1))
    expect(vi.mocked(window.showSaveFilePicker).mock.calls[0][0]?.suggestedName).toBe('farbtopf.png')
  })
})
