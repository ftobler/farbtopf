import type { Point, Rect } from './geometry'
import { tighten } from './selection'
import type { Selection } from './selection'

/** What to select: the object inside a dragged rectangle, or the one under a clicked point. */
export type ObjectTarget = { kind: 'rect'; rect: Rect } | { kind: 'point'; point: Point }

/** What a removal changed: new RGBA bytes over `rect` (pixels outside the hole keep their values). */
export interface Removal {
  rect: Rect
  pixels: Uint8ClampedArray
}

/** The functions the WebAssembly module (wasm/src/lib.rs) exports. */
interface AlgorithmExports {
  memory: WebAssembly.Memory
  image_buffer(width: number, height: number): number
  select_rect(x: number, y: number, width: number, height: number): number
  select_point(x: number, y: number): number
  stroke_buffer(): number
  remove_stroke(closeLoops: number): number
  result_x(): number
  result_y(): number
  result_width(): number
  result_height(): number
  result_mask(): number
  result_pixels(): number
}

/** Coverage at or above this (of 255) counts as selected; selections here are all-or-nothing. */
const COVERED = 128

/**
 * Turns the module's 8-bit coverage over `rect` into a selection on a
 * `width`×`height` canvas: clipped to the canvas, tightened, and without a mask
 * when every pixel of its rectangle is selected. Null when nothing is selected.
 */
export function coverageToSelection(rect: Rect, coverage: Uint8Array, width: number, height: number): Selection | null {
  const x0 = Math.max(0, rect.x)
  const y0 = Math.max(0, rect.y)
  const x1 = Math.min(width, rect.x + rect.width)
  const y1 = Math.min(height, rect.y + rect.height)
  if (x1 <= x0 || y1 <= y0) return null
  const boxWidth = x1 - x0
  const flags = new Uint8Array(boxWidth * (y1 - y0))
  for (let y = y0; y < y1; y += 1) {
    const row = (y - rect.y) * rect.width - rect.x
    for (let x = x0; x < x1; x += 1) {
      if (coverage[row + x] >= COVERED) flags[(y - y0) * boxWidth + x - x0] = 1
    }
  }
  const tight = tighten(flags, boxWidth, y1 - y0)
  if (!tight) return null
  return { rect: { ...tight.rect, x: tight.rect.x + x0, y: tight.rect.y + y0 }, mask: tight.mask }
}

/**
 * The image algorithms of the WebAssembly module: Object Selection (GrabCut graph
 * cuts seeded by a rectangle or a point) and the Remove Tool (patch-based
 * completion). Holds one image at a time, so several calls on the same pixels
 * copy them once.
 */
export class Algorithms {
  private readonly exports: AlgorithmExports
  private width = 0
  private height = 0

  private constructor(exports: AlgorithmExports) {
    this.exports = exports
  }

  static async create(module: BufferSource | WebAssembly.Module): Promise<Algorithms> {
    const compiled = module instanceof WebAssembly.Module ? module : await WebAssembly.compile(module)
    const instance = await WebAssembly.instantiate(compiled, {})
    return new Algorithms(instance.exports as unknown as AlgorithmExports)
  }

  /** Copies a `width`×`height` image of straight RGBA bytes (`ImageData.data`) into the module. */
  load(width: number, height: number, pixels: Uint8Array | Uint8ClampedArray): void {
    if (pixels.length !== width * height * 4) throw new Error(`Expected ${width * height * 4} bytes, got ${pixels.length}`)
    const address = this.exports.image_buffer(width, height)
    if (address === 0) throw new Error(`Cannot hold a ${width}×${height} image`)
    // Made after the call: growing the memory replaces its buffer.
    new Uint8Array(this.exports.memory.buffer, address, pixels.length).set(pixels)
    this.width = width
    this.height = height
  }

  /** The object `target` picks on the loaded image, or null when it finds none. */
  select(target: ObjectTarget): Selection | null {
    const e = this.exports
    const found =
      target.kind === 'rect'
        ? e.select_rect(target.rect.x, target.rect.y, target.rect.width, target.rect.height)
        : e.select_point(target.point.x, target.point.y)
    if (!found) return null
    const rect = this.resultRect()
    const coverage = new Uint8Array(e.memory.buffer, e.result_mask(), rect.width * rect.height)
    return coverageToSelection(rect, coverage, this.width, this.height)
  }

  /**
   * Fills what `stroke` (one byte per pixel of the loaded image, non-zero where
   * the brush painted) covers from its surroundings; with `closeLoops`, also what
   * the stroke encloses. Null when nothing changes (an empty or fully transparent
   * area, or no pixels left around the stroke to fill it from).
   */
  remove(stroke: Uint8Array, closeLoops = true): Removal | null {
    const e = this.exports
    if (stroke.length !== this.width * this.height) throw new Error(`Expected a ${this.width}×${this.height} stroke`)
    const address = e.stroke_buffer()
    if (address === 0) throw new Error('No image is loaded')
    new Uint8Array(e.memory.buffer, address, stroke.length).set(stroke)
    if (e.remove_stroke(closeLoops ? 1 : 0) !== 1) return null
    const rect = this.resultRect()
    const pixels = new Uint8ClampedArray(e.memory.buffer, e.result_pixels(), rect.width * rect.height * 4).slice()
    return { rect, pixels }
  }

  private resultRect(): Rect {
    const e = this.exports
    return { x: e.result_x(), y: e.result_y(), width: e.result_width(), height: e.result_height() }
  }
}
