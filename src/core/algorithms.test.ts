import { beforeAll, describe, expect, it } from 'vitest'
import { Algorithms, coverageToSelection } from './algorithms'
import { isSelected } from './selection'
import { wasmBytes } from '../test/wasm'

/** An opaque red square of side `side` at (`x0`, `y0`) on a light grey background. */
function squareImage(width: number, height: number, x0: number, y0: number, side: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = (x * 13 + y * 7) % 9
      const inside = x >= x0 && x < x0 + side && y >= y0 && y < y0 + side
      data.set(inside ? [200 + noise, 30, 20, 255] : [220, 222 - noise, 225, 255], (y * width + x) * 4)
    }
  }
  return data
}

describe('coverageToSelection', () => {
  it('keeps pixels covered at least half as selected', () => {
    const coverage = new Uint8Array([0, 127, 128, 255, 255, 255])
    const selection = coverageToSelection({ x: 4, y: 2, width: 3, height: 2 }, coverage, 20, 20)
    expect(selection?.rect).toEqual({ x: 4, y: 2, width: 3, height: 2 })
    expect(Array.from(selection?.mask?.data ?? [])).toEqual([0, 0, 1, 1, 1, 1])
  })

  it('tightens to the selected pixels and drops a mask that covers its whole rectangle', () => {
    const coverage = new Uint8Array([0, 0, 0, 0, 255, 200, 0, 255, 255])
    expect(coverageToSelection({ x: 10, y: 10, width: 3, height: 3 }, coverage, 20, 20)).toEqual({
      rect: { x: 11, y: 11, width: 2, height: 2 },
      mask: null,
    })
  })

  it('clips a result reaching past the canvas and is null when nothing is left', () => {
    const coverage = new Uint8Array(16).fill(255)
    expect(coverageToSelection({ x: -2, y: 18, width: 4, height: 4 }, coverage, 20, 20)?.rect).toEqual({
      x: 0,
      y: 18,
      width: 2,
      height: 2,
    })
    expect(coverageToSelection({ x: 0, y: 0, width: 2, height: 2 }, new Uint8Array(4), 20, 20)).toBeNull()
    expect(coverageToSelection({ x: 30, y: 0, width: 2, height: 2 }, new Uint8Array(4).fill(255), 20, 20)).toBeNull()
  })
})

describe('Algorithms: object selection (WebAssembly)', () => {
  let selector: Algorithms
  beforeAll(async () => {
    selector = await Algorithms.create(wasmBytes())
  })

  it('selects the object inside a loosely drawn rectangle', () => {
    selector.load(300, 200, squareImage(300, 200, 100, 50, 80))
    const selection = selector.select({ kind: 'rect', rect: { x: 70, y: 30, width: 140, height: 130 } })
    expect(selection).not.toBeNull()
    const { rect, mask } = selection!
    expect(isSelected(rect, mask, 140, 90)).toBe(true)
    expect(isSelected(rect, mask, 101, 51)).toBe(true)
    expect(isSelected(rect, mask, 90, 90)).toBe(false)
    expect(isSelected(rect, mask, 140, 40)).toBe(false)
    expect(rect.x).toBeGreaterThanOrEqual(98)
    expect(rect.x + rect.width).toBeLessThanOrEqual(182)
  })

  it('selects the object under a clicked point, and nothing on the background', () => {
    selector.load(300, 200, squareImage(300, 200, 100, 50, 80))
    const selection = selector.select({ kind: 'point', point: { x: 140, y: 90 } })
    expect(selection && isSelected(selection.rect, selection.mask, 120, 70)).toBe(true)
    expect(selection && isSelected(selection.rect, selection.mask, 90, 90)).toBe(false)
    expect(selector.select({ kind: 'point', point: { x: 5, y: 5 } })).toBeNull()
  })

  it('keeps one image loaded for several selections and replaces it on the next load', () => {
    selector.load(300, 200, squareImage(300, 200, 100, 50, 80))
    expect(selector.select({ kind: 'point', point: { x: 140, y: 90 } })).not.toBeNull()
    expect(selector.select({ kind: 'point', point: { x: 150, y: 100 } })).not.toBeNull()
    selector.load(120, 90, squareImage(120, 90, 20, 20, 40))
    const selection = selector.select({ kind: 'point', point: { x: 40, y: 40 } })
    expect(selection?.rect.x).toBeGreaterThanOrEqual(18)
    expect(selection!.rect.x + selection!.rect.width).toBeLessThanOrEqual(62)
  })

  it('rejects images it cannot hold and pixel buffers of the wrong size', () => {
    expect(() => selector.load(0, 10, new Uint8ClampedArray(0))).toThrow()
    expect(() => selector.load(10, 10, new Uint8ClampedArray(12))).toThrow()
  })
})

/** Vertical stripes, 4 px dark and 4 px light, with a red square of side `side` at (`x0`, `y0`). */
function stripesWithSquare(width: number, height: number, x0: number, y0: number, side: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const square = x >= x0 && x < x0 + side && y >= y0 && y < y0 + side
      data.set(square ? [220, 20, 30, 255] : Math.floor(x / 4) % 2 ? [200, 210, 220, 255] : [40, 60, 80, 255], (y * width + x) * 4)
    }
  }
  return data
}

function strokeOver(width: number, height: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const stroke = new Uint8Array(width * height)
  for (let y = y0; y < y1; y += 1) stroke.fill(1, y * width + x0, y * width + x1)
  return stroke
}

describe('Algorithms: remove (WebAssembly)', () => {
  let algorithms: Algorithms
  beforeAll(async () => {
    algorithms = await Algorithms.create(wasmBytes())
  })

  it('fills a painted-over square from the stripes around it', () => {
    const image = stripesWithSquare(160, 120, 70, 50, 12)
    algorithms.load(160, 120, image)
    const removal = algorithms.remove(strokeOver(160, 120, 68, 48, 84, 64))
    expect(removal).not.toBeNull()
    const { rect, pixels } = removal!
    expect(rect.x).toBeLessThanOrEqual(66)
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(86)
    expect(pixels).toHaveLength(rect.width * rect.height * 4)
    const at = (x: number, y: number) => Array.from(pixels.slice(((y - rect.y) * rect.width + x - rect.x) * 4, ((y - rect.y) * rect.width + x - rect.x) * 4 + 4))
    for (let y = 50; y < 62; y += 1) {
      for (let x = 70; x < 82; x += 1) {
        const [r, g, , a] = at(x, y)
        expect(r > 150 && g < 80, `red left at ${x},${y}`).toBe(false)
        expect(a).toBe(255)
      }
    }
    // Away from the stroke the bytes are the image's own.
    expect(at(rect.x, rect.y)).toEqual(Array.from(image.slice((rect.y * 160 + rect.x) * 4, (rect.y * 160 + rect.x) * 4 + 4)))
  })

  it('changes nothing for an empty stroke, one covering everything, or a transparent layer', () => {
    algorithms.load(40, 30, stripesWithSquare(40, 30, 10, 10, 5))
    expect(algorithms.remove(new Uint8Array(40 * 30))).toBeNull()
    expect(algorithms.remove(new Uint8Array(40 * 30).fill(1))).toBeNull()
    algorithms.load(40, 30, new Uint8ClampedArray(40 * 30 * 4))
    expect(algorithms.remove(strokeOver(40, 30, 5, 5, 9, 9))).toBeNull()
    expect(() => algorithms.remove(new Uint8Array(3))).toThrow()
  })
})
