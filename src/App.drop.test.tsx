import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

function dragEvent(type: string, files: File[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files, dropEffect: 'none' },
  })
  return event
}

const image = (name = 'photo.png') => new File(['x'], name, { type: 'image/png' })
const text = (name = 'notes.txt') => new File(['x'], name, { type: 'text/plain' })

async function makeDirty() {
  fireEvent.click(screen.getByText('File'))
  const item = screen
    .getAllByRole('menuitem')
    .find((entry) => entry.querySelector('.menu-item-label')?.textContent === 'Clear canvas')
  if (!item) throw new Error('No File menu item Clear canvas')
  await act(async () => {
    fireEvent.click(item)
  })
}

describe('App drop', () => {
  it('opens a dropped image like File > Open', async () => {
    render(<App />)
    expect(screen.getByText('800 × 600 px')).toBeTruthy()
    const drop = dragEvent('drop', [image()])
    await act(async () => {
      window.dispatchEvent(drop)
    })
    expect(drop.defaultPrevented).toBe(true)
    await waitFor(() => expect(screen.getByText('320 × 240 px')).toBeTruthy())
    expect(screen.getByText('Opened photo.png')).toBeTruthy()
  })

  it('prevents the browser from opening a file dragged over the page', () => {
    render(<App />)
    const over = dragEvent('dragover', [])
    act(() => {
      window.dispatchEvent(over)
    })
    expect(over.defaultPrevented).toBe(true)
  })

  it('uses the first image when several files are dropped', async () => {
    render(<App />)
    await act(async () => {
      window.dispatchEvent(dragEvent('drop', [text(), image('first.png'), image('second.png')]))
    })
    await waitFor(() => expect(screen.getByText('Opened first.png')).toBeTruthy())
  })

  it('ignores drops without an image', async () => {
    render(<App />)
    const drop = dragEvent('drop', [text()])
    await act(async () => {
      window.dispatchEvent(drop)
    })
    expect(drop.defaultPrevented).toBe(true)
    expect(screen.getByText('800 × 600 px')).toBeTruthy()
    expect(screen.getByText('Could not open that image')).toBeTruthy()
  })

  it('asks before a dropped file replaces unsaved work', async () => {
    render(<App />)
    await makeDirty()
    await act(async () => {
      window.dispatchEvent(dragEvent('drop', [image()]))
    })
    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeTruthy()
    expect(screen.getByText('800 × 600 px')).toBeTruthy()
    expect(screen.queryByText('Opened photo.png')).toBeNull()
  })

  it('opens the dropped file after discarding', async () => {
    render(<App />)
    await makeDirty()
    await act(async () => {
      window.dispatchEvent(dragEvent('drop', [image()]))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    })
    await waitFor(() => expect(screen.getByText('320 × 240 px')).toBeTruthy())
    expect(screen.getByText('Opened photo.png')).toBeTruthy()
  })

  it('drops without asking when the document is clean', async () => {
    render(<App />)
    await act(async () => {
      window.dispatchEvent(dragEvent('drop', [image()]))
    })
    expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).toBeNull()
    await waitFor(() => expect(screen.getByText('Opened photo.png')).toBeTruthy())
  })

  it('highlights the window while a file is dragged over it', () => {
    const { container } = render(<App />)
    const app = container.querySelector('.app')!
    act(() => {
      window.dispatchEvent(dragEvent('dragover', []))
    })
    expect(app.classList.contains('app--drop-target')).toBe(true)
    act(() => {
      window.dispatchEvent(dragEvent('drop', []))
    })
    expect(app.classList.contains('app--drop-target')).toBe(false)
  })
})
