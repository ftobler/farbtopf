import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Bitmap } from './core/bitmap'
import App from './App'

const pasted = { width: 40, height: 30 }

vi.mock('./render/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./render/image')>()
  return {
    ...actual,
    readFileAsDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA'),
    bitmapFromDataUrl: vi.fn(
      async () => new Bitmap(pasted.width, pasted.height, { r: 255, g: 0, b: 0, a: 255 }),
    ),
  }
})

function pasteEvent(): Event {
  const file = new File(['x'], 'image.png', { type: 'image/png' })
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { items: [{ type: 'image/png', getAsFile: () => file }] },
  })
  return event
}

describe('App paste', () => {
  afterEach(() => {
    pasted.width = 40
    pasted.height = 30
  })

  it('pastes a smaller image as a selection without changing the canvas size', async () => {
    render(<App />)
    expect(screen.getByText('800 × 600 px')).toBeTruthy()
    await act(async () => {
      window.dispatchEvent(pasteEvent())
    })
    await waitFor(() => expect(screen.getByLabelText('Selection size').textContent).toBe('40 × 30 px'))
    expect(screen.getByText('800 × 600 px')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Select' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('enlarges the canvas only as much as a bigger paste needs', async () => {
    pasted.width = 1000
    pasted.height = 20
    render(<App />)
    await act(async () => {
      window.dispatchEvent(pasteEvent())
    })
    await waitFor(() => expect(screen.getByText('1000 × 600 px')).toBeTruthy())
  })

  it('pastes from the clipboard API as a selection too', async () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: vi.fn(async () => [{ types: ['image/png'], getType: async () => blob }]) },
    })
    render(<App />)
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    await waitFor(() => expect(screen.getByLabelText('Selection size').textContent).toBe('40 × 30 px'))
    expect(screen.getByText('800 × 600 px')).toBeTruthy()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  })
})
