import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from './core/bitmap'
import type { Rgba } from './core/color'
import { bitmapFromDataUrl } from './render/image'
import App from './App'

vi.mock('./render/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./render/image')>()
  return {
    ...actual,
    readFileAsDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA'),
    bitmapFromDataUrl: vi.fn(async () => new Bitmap(1, 1)),
  }
})

const R: Rgba = { r: 255, g: 0, b: 0, a: 255 }
const G: Rgba = { r: 0, g: 255, b: 0, a: 255 }
const B: Rgba = { r: 0, g: 0, b: 255, a: 255 }
const K: Rgba = { r: 0, g: 0, b: 0, a: 255 }
const W: Rgba = { r: 255, g: 255, b: 255, a: 255 }
const Y: Rgba = { r: 255, g: 255, b: 0, a: 255 }

const hex = ({ r, g, b, a }: Rgba) => [r, g, b, a].map((v) => v.toString(16).padStart(2, '0')).join('')

/** A 3×2 image with a distinct colour in every pixel. */
const PATTERN = [
  [R, G, B],
  [K, W, Y],
]

function bitmapOf(rows: Rgba[][]): Bitmap {
  const bitmap = new Bitmap(rows[0].length, rows.length)
  rows.forEach((row, y) => row.forEach((color, x) => bitmap.set(x, y, color)))
  return bitmap
}

function dropEvent(): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  const file = new File(['x'], 'pattern.png', { type: 'image/png' })
  Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: [file], dropEffect: 'none' } })
  return event
}

/** Renders the app with the select tool and records what the image canvas shows. */
function setup() {
  const { container } = render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  const workspace = container.querySelector('.workspace') as HTMLElement
  const canvas = container.querySelector('.paint-canvas') as HTMLCanvasElement
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext

  /** The image on screen, row by row, as rrggbbaa strings. */
  const shown = () => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as ImageData
    const rows: string[][] = []
    for (let y = 0; y < image.height; y += 1) {
      const row: string[] = []
      for (let x = 0; x < image.width; x += 1) {
        const i = (y * image.width + x) * 4
        const [r, g, b, a] = image.data.slice(i, i + 4)
        row.push(hex({ r, g, b, a }))
      }
      rows.push(row)
    }
    return rows
  }

  const open = async (rows: Rgba[][] = PATTERN) => {
    vi.mocked(bitmapFromDataUrl).mockResolvedValueOnce(bitmapOf(rows))
    await act(async () => {
      window.dispatchEvent(dropEvent())
    })
    await waitFor(() => expect(screen.getByText(`${rows[0].length} × ${rows.length} px`)).toBeTruthy())
  }

  const openMenu = () => fireEvent.contextMenu(workspace, { clientX: 40, clientY: 40 })
  const item = (name: string | RegExp) => screen.getByRole('menuitem', { name }) as HTMLButtonElement
  const run = (name: string | RegExp, submenu?: string) => {
    openMenu()
    if (submenu) fireEvent.mouseEnter(item(submenu))
    fireEvent.click(item(name))
    expect(screen.queryByRole('menu')).toBeNull()
  }
  const selectAll = () => run(/^Select all/)
  const selectionSize = () => screen.getByLabelText('Selection size').textContent
  const crop = () => screen.getByRole('button', { name: 'Crop' }) as HTMLButtonElement

  return { container, canvas, shown, open, openMenu, item, run, selectAll, selectionSize, crop }
}

const rows = (pattern: Rgba[][]) => pattern.map((row) => row.map(hex))

describe('App edit context menu', () => {
  it('disables crop and delete without a selection', () => {
    const { openMenu, item } = setup()
    openMenu()
    expect(item('Crop').disabled).toBe(true)
    expect(item(/^Delete/).disabled).toBe(true)
  })

  it('crops the image to the selection', () => {
    const { canvas, run, item, openMenu } = setup()
    canvas.getBoundingClientRect = () =>
      ({ x: 100, y: 100, left: 100, top: 100, right: 900, bottom: 700, width: 800, height: 600, toJSON: () => ({}) }) as DOMRect
    canvas.setPointerCapture = vi.fn()
    canvas.releasePointerCapture = vi.fn()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 110, clientY: 120 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 229, clientY: 164 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 229, clientY: 164 })
    openMenu()
    expect(item('Crop').disabled).toBe(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    run('Crop')
    expect(screen.getByText('120 × 45 px')).toBeTruthy()
  })

  it('selects the whole image', async () => {
    const { open, selectAll, selectionSize, crop } = setup()
    await open()
    selectAll()
    expect(selectionSize()).toBe('3 × 2 px')
    expect(crop().disabled).toBe(false)
  })

  it('inverts the selection', async () => {
    const { open, run, selectAll, selectionSize, crop } = setup()
    await open()
    run('Invert selection')
    expect(selectionSize()).toBe('3 × 2 px')
    selectAll()
    run('Invert selection')
    expect(selectionSize()).toBe('')
    expect(crop().disabled).toBe(true)
  })

  it('deletes the selected pixels to the secondary colour', async () => {
    const { open, run, selectAll, shown, selectionSize } = setup()
    await open()
    selectAll()
    run(/^Delete/)
    expect(shown()).toEqual(rows([
      [W, W, W],
      [W, W, W],
    ]))
    expect(selectionSize()).toBe('')
  })

  it('rotates right by 90° clockwise, swapping width and height', async () => {
    const { open, run, shown } = setup()
    await open()
    run('Rotate right 90°', 'Rotate')
    expect(screen.getByText('2 × 3 px')).toBeTruthy()
    expect(shown()).toEqual(rows([
      [K, R],
      [W, G],
      [Y, B],
    ]))
  })

  it('rotates left by 90° counter-clockwise, swapping width and height', async () => {
    const { open, run, shown } = setup()
    await open()
    run('Rotate left 90°', 'Rotate')
    expect(screen.getByText('2 × 3 px')).toBeTruthy()
    expect(shown()).toEqual(rows([
      [B, Y],
      [G, W],
      [R, K],
    ]))
  })

  it('rotates by 180°, keeping the size', async () => {
    const { open, run, shown } = setup()
    await open()
    run('Rotate 180°', 'Rotate')
    expect(screen.getByText('3 × 2 px')).toBeTruthy()
    expect(shown()).toEqual(rows([
      [Y, W, K],
      [B, G, R],
    ]))
  })

  it('flips horizontally', async () => {
    const { open, run, shown } = setup()
    await open()
    run('Flip horizontal', 'Flip')
    expect(shown()).toEqual(rows([
      [B, G, R],
      [Y, W, K],
    ]))
  })

  it('flips vertically', async () => {
    const { open, run, shown } = setup()
    await open()
    run('Flip vertical', 'Flip')
    expect(shown()).toEqual(rows([
      [K, W, Y],
      [R, G, B],
    ]))
  })

  it('opens the scale dialog for the image, or for the selection', async () => {
    const { open, run, selectAll } = setup()
    await open()
    run('Resize')
    let dialog = screen.getByRole('dialog', { name: 'Scale image' })
    expect(within(dialog).getByText('3 × 2 px')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    selectAll()
    run('Resize')
    dialog = screen.getByRole('dialog', { name: 'Scale selection' })
    expect(dialog).toBeTruthy()
  })

  it('inverts the colours of the image as one undoable step', async () => {
    const { open, run, shown } = setup()
    await open()
    run('Invert color')
    const C: Rgba = { r: 0, g: 255, b: 255, a: 255 }
    const M: Rgba = { r: 255, g: 0, b: 255, a: 255 }
    expect(shown()).toEqual(rows([
      [C, M, Y],
      [W, K, B],
    ]))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(shown()).toEqual(rows(PATTERN))
  })
})
