import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import {
  BRUSHES,
  HIGHLIGHTER_ALPHA,
  brushById,
  compositeHighlighter,
  compositeHighlighterInto,
  createCoverageMask,
  isColorBrush,
  paintBrushStroke,
  SPRAY_TICK_MS,
  pixelateBlockSize,
  pixelateDab,
  sprayCanDots,
  sprayDab,
  stampHighlighter,
} from './brushes'
import { seededRandom } from './random'
import type { BrushId } from './brushes'
import { BLACK, WHITE } from './color'

function pixelData(bitmap: Bitmap): number[] {
  return Array.from(bitmap.data)
}

function rightmostDark(bitmap: Bitmap, y: number): number {
  let edge = -1
  for (let x = 0; x < bitmap.width; x += 1) {
    if (bitmap.get(x, y).r < 128) edge = x
  }
  return edge
}

function darkLeftHalf(width: number, height: number): Bitmap {
  const bitmap = new Bitmap(width, height, WHITE)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width / 2; x += 1) bitmap.set(x, y, BLACK)
  }
  return bitmap
}

function countNonWhite(bitmap: Bitmap): number {
  let count = 0
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      if (bitmap.get(x, y).r < 255) count += 1
    }
  }
  return count
}

describe('brushes', () => {
  it('lists the brushes in order', () => {
    expect(BRUSHES.map((brush) => brush.id)).toEqual([
      'round',
      'soft',
      'natural',
      'calligraphy',
      'highlighter',
      'spray',
      'pixelate',
      'blur',
      'smudge',
      'liquify',
    ])
    expect(BRUSHES.map((brush) => brush.label)).toEqual([
      'Circle sharp',
      'Circle blurred',
      'Natural brush',
      'Calligraphy pen',
      'Highlighter pen',
      'Spray can',
      'Pixelate',
      'Selective blurring',
      'Smudge',
      'Liquify',
    ])
  })

  it('finds brushes by id', () => {
    expect(brushById('smudge').label).toBe('Smudge')
    expect(() => brushById('nope' as never)).toThrow()
  })

  it('knows which brushes lay down colour', () => {
    expect(isColorBrush('round')).toBe(true)
    expect(isColorBrush('natural')).toBe(true)
    expect(isColorBrush('highlighter')).toBe(true)
    expect(isColorBrush('blur')).toBe(false)
    expect(isColorBrush('smudge')).toBe(false)
    expect(isColorBrush('liquify')).toBe(false)
  })

  it('paints a crisp circle with the round brush', () => {
    const bitmap = new Bitmap(20, 20, WHITE)
    paintBrushStroke(bitmap, { x: 10, y: 10 }, { x: 10, y: 10 }, { size: 6, color: BLACK, brush: 'round' })
    expect(bitmap.get(10, 10).r).toBe(0)
    expect(bitmap.get(0, 0).r).toBe(255)
  })

  it('makes the round brush grow with every size step, even ones included', () => {
    let previous = 0
    for (let size = 2; size <= 8; size += 1) {
      const bitmap = new Bitmap(20, 20, WHITE)
      paintBrushStroke(bitmap, { x: 10, y: 10 }, { x: 10, y: 10 }, { size, color: BLACK, brush: 'round' })
      const painted = countNonWhite(bitmap)
      expect(painted, `size ${size}`).toBeGreaterThan(previous)
      previous = painted
    }
  })

  it('feathers the edge with the circle blurred brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 17, color: BLACK, brush: 'soft' })
    expect(bitmap.get(20, 20).r).toBeLessThan(10)
    const edge = bitmap.get(27, 20).r
    expect(edge).toBeGreaterThan(200)
    expect(edge).toBeLessThan(255)
  })

  it('scatters bristles with the natural brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 12, color: BLACK, brush: 'natural' })
    expect(countNonWhite(bitmap)).toBeGreaterThan(3)
  })

  it('paints a slanted nib with the calligraphy brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 12, color: BLACK, brush: 'calligraphy' })
    expect(countNonWhite(bitmap)).toBeGreaterThan(4)
    expect(bitmap.get(20, 20).r).toBeLessThan(255)
  })

  it('softens a hard edge with selective blurring', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    bitmap.set(20, 20, BLACK)
    paintBrushStroke(bitmap, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 8, color: BLACK, brush: 'blur' })
    expect(bitmap.get(20, 20).r).toBeGreaterThan(0)
    expect(bitmap.get(21, 20).r).toBeLessThan(255)
  })

  it('drags colour along with the smudge brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 20; x += 1) bitmap.set(x, y, BLACK)
    }
    paintBrushStroke(bitmap, { x: 18, y: 20 }, { x: 22, y: 20 }, { size: 8, color: BLACK, brush: 'smudge' })
    expect(bitmap.get(21, 20).r).toBeLessThan(255)
  })

  it('pushes pixels with the liquify brush', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    bitmap.set(20, 20, BLACK)
    paintBrushStroke(bitmap, { x: 18, y: 20 }, { x: 22, y: 20 }, { size: 8, color: BLACK, brush: 'liquify' })
    expect(bitmap.get(22, 20).r).toBeLessThan(128)
  })

  it('paints a contiguous stroke along a drag whose length does not divide the spacing', () => {
    for (const size of [2, 3, 5, 8, 12, 20, 32]) {
      const bitmap = new Bitmap(60, 30, WHITE)
      paintBrushStroke(bitmap, { x: 2, y: 10 }, { x: 37, y: 10 }, { size, color: BLACK, brush: 'round' })
      for (let x = 2; x <= 37; x += 1) {
        expect(bitmap.get(x, 10).r, `size ${size} left a gap at x=${x}`).toBeLessThan(128)
      }
    }
  })

  it('paints at least one pixel with the soft brush at size 2', () => {
    const bitmap = new Bitmap(10, 10, WHITE)
    paintBrushStroke(bitmap, { x: 5, y: 5 }, { x: 5, y: 5 }, { size: 2, color: BLACK, brush: 'soft' })
    expect(countNonWhite(bitmap)).toBeGreaterThan(0)
  })

  it('keeps one flat alpha for overlapping highlighter segments', () => {
    const base = new Bitmap(40, 40, WHITE)
    const whole = createCoverageMask(40, 40)
    stampHighlighter(whole, { x: 8, y: 20 }, { x: 24, y: 20 }, 12)
    const single = compositeHighlighter(base, whole, BLACK, HIGHLIGHTER_ALPHA)

    const split = createCoverageMask(40, 40)
    stampHighlighter(split, { x: 8, y: 20 }, { x: 16, y: 20 }, 12)
    stampHighlighter(split, { x: 16, y: 20 }, { x: 24, y: 20 }, 12)
    const overlapped = compositeHighlighter(base, split, BLACK, HIGHLIGHTER_ALPHA)

    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        expect(overlapped.get(x, y), `pixel ${x},${y} darkened`).toEqual(single.get(x, y))
      }
    }
  })

  it('composites a region into an existing bitmap without touching pixels outside it', () => {
    const width = 40
    const height = 40
    const base = new Bitmap(width, height, WHITE)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if ((x + y) % 3 === 0) base.set(x, y, { r: 120, g: 80, b: 200, a: 255 })
      }
    }
    const mask = createCoverageMask(width, height)
    stampHighlighter(mask, { x: 6, y: 12 }, { x: 30, y: 20 }, 10)
    const full = compositeHighlighter(base, mask, BLACK, HIGHLIGHTER_ALPHA)

    const whole = base.clone()
    compositeHighlighterInto(whole, base, mask, BLACK, HIGHLIGHTER_ALPHA)
    expect(pixelData(whole)).toEqual(pixelData(full))

    const sentinel = { r: 1, g: 2, b: 3, a: 4 }
    const dst = new Bitmap(width, height, sentinel)
    const rect = { x: 8, y: 14, width: 12, height: 8 }
    compositeHighlighterInto(dst, base, mask, BLACK, HIGHLIGHTER_ALPHA, rect)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const inside =
          x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
        expect(dst.get(x, y), `pixel ${x},${y}`).toEqual(inside ? full.get(x, y) : sentinel)
      }
    }
  })

  it('stamps an upright capital-I nib with a bar and wider caps', () => {
    const mask = createCoverageMask(40, 40)
    stampHighlighter(mask, { x: 20, y: 20 }, { x: 20, y: 20 }, 12)
    const coverage = (x: number, y: number) => mask.data[y * 40 + x]
    // The stem runs the full height through the centre.
    expect(coverage(20, 20)).toBeGreaterThan(0)
    expect(coverage(20, 15)).toBeGreaterThan(0)
    // The top and bottom caps are wider than the stem.
    expect(coverage(15, 15)).toBeGreaterThan(0)
    expect(coverage(15, 25)).toBeGreaterThan(0)
    // Mid-height only the narrow bar is painted.
    expect(coverage(15, 20)).toBe(0)
    expect(coverage(25, 20)).toBe(0)
    // Nothing is painted beyond the nib.
    expect(coverage(20, 13)).toBe(0)
  })

  it('bounds, keeps deterministic and matches fast against slow liquify drags', () => {
    const fast = darkLeftHalf(60, 40)
    paintBrushStroke(fast, { x: 20, y: 20 }, { x: 40, y: 20 }, { size: 20, color: BLACK, brush: 'liquify' })
    const again = darkLeftHalf(60, 40)
    paintBrushStroke(again, { x: 20, y: 20 }, { x: 40, y: 20 }, { size: 20, color: BLACK, brush: 'liquify' })
    expect(pixelData(again)).toEqual(pixelData(fast))

    // The feature moved, but no runaway: the edge cannot move further than the
    // brush radius (the original fixed-amplitude code moved it off the canvas).
    expect(rightmostDark(fast, 20)).toBeGreaterThan(30)
    expect(rightmostDark(fast, 20)).toBeLessThanOrEqual(30 + 10)

    // Splitting the same drag into many small moves agrees with one fast move.
    const slow = darkLeftHalf(60, 40)
    for (let x = 20; x < 40; x += 4) {
      paintBrushStroke(slow, { x, y: 20 }, { x: x + 4, y: 20 }, { size: 20, color: BLACK, brush: 'liquify' })
    }
    expect(rightmostDark(slow, 20)).toBeGreaterThan(30)
    expect(Math.abs(rightmostDark(fast, 20) - rightmostDark(slow, 20))).toBeLessThanOrEqual(2)
  })

  it('leaves the canvas untouched for a zero-length liquify segment', () => {
    const bitmap = darkLeftHalf(60, 40)
    const before = pixelData(bitmap)
    for (let i = 0; i < 10; i += 1) {
      paintBrushStroke(bitmap, { x: 30, y: 20 }, { x: 30, y: 20 }, { size: 20, color: BLACK, brush: 'liquify' })
    }
    expect(pixelData(bitmap)).toEqual(before)
  })
})

describe('sprayDab', () => {
  it('keeps the spray inside a circle of the given diameter', () => {
    const bitmap = new Bitmap(40, 40, WHITE)
    sprayDab(bitmap, { x: 20, y: 20 }, 10, BLACK)
    let count = 0
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        if (bitmap.get(x, y).r === 255) continue
        count += 1
        expect(Math.hypot(x - 20, y - 20)).toBeLessThanOrEqual(5.75)
      }
    }
    expect(count).toBeGreaterThan(5)
  })

  it('reaches out to the full radius of a 500 px spray', () => {
    const bitmap = new Bitmap(600, 600, WHITE)
    for (let i = 0; i < 4; i += 1) sprayDab(bitmap, { x: 300, y: 300 }, 500, BLACK)
    let farthest = 0
    for (let y = 0; y < 600; y += 3) {
      for (let x = 0; x < 600; x += 3) {
        if (bitmap.get(x, y).r < 255) farthest = Math.max(farthest, Math.hypot(x - 300, y - 300))
      }
    }
    expect(farthest).toBeGreaterThan(200)
    expect(farthest).toBeLessThanOrEqual(251)
  })
})

describe('large brush sizes', () => {
  const colorBrushes: BrushId[] = ['round', 'soft', 'natural', 'calligraphy']
  for (const brush of colorBrushes) {
    it(`paints a 500 px ${brush} stroke in reasonable time`, () => {
      const bitmap = new Bitmap(700, 700, WHITE)
      const started = performance.now()
      paintBrushStroke(bitmap, { x: 300, y: 350 }, { x: 400, y: 350 }, { size: 500, color: BLACK, brush })
      expect(performance.now() - started).toBeLessThan(3000)
      // The middle of the stroke is painted and the far corner is not.
      let painted = 0
      for (let y = 330; y < 370; y += 1) {
        for (let x = 330; x < 370; x += 1) if (bitmap.get(x, y).r < 255) painted += 1
      }
      expect(painted).toBeGreaterThan(40 * 40 * 0.1)
      expect(bitmap.get(2, 2)).toEqual(WHITE)
    })
  }

  it('makes a 500 px round stroke 500 px tall', () => {
    const bitmap = new Bitmap(700, 700, WHITE)
    paintBrushStroke(bitmap, { x: 340, y: 350 }, { x: 360, y: 350 }, { size: 500, color: BLACK, brush: 'round' })
    expect(bitmap.get(350, 350 - 248)).toEqual(BLACK)
    expect(bitmap.get(350, 350 + 248)).toEqual(BLACK)
    expect(bitmap.get(350, 350 - 255)).toEqual(WHITE)
  })
})

describe('spray can', () => {
  const painted = (bitmap: Bitmap) => countNonWhite(bitmap)

  it('lays down colour', () => {
    expect(isColorBrush('spray')).toBe(true)
  })

  it('is repeatable with a seeded random source', () => {
    const a = new Bitmap(40, 40, WHITE)
    const b = new Bitmap(40, 40, WHITE)
    sprayDab(a, { x: 20, y: 20 }, 16, BLACK, seededRandom(7), sprayCanDots(16))
    sprayDab(b, { x: 20, y: 20 }, 16, BLACK, seededRandom(7), sprayCanDots(16))
    expect(pixelData(a)).toEqual(pixelData(b))
    const c = new Bitmap(40, 40, WHITE)
    sprayDab(c, { x: 20, y: 20 }, 16, BLACK, seededRandom(8), sprayCanDots(16))
    expect(pixelData(c)).not.toEqual(pixelData(a))
  })

  it('sprays a few dots per tick, growing with the area', () => {
    expect(sprayCanDots(1)).toBeGreaterThanOrEqual(1)
    expect(sprayCanDots(40)).toBeGreaterThan(sprayCanDots(10))
    // Sparser than one airbrush puff, so holding still builds up gradually.
    expect(sprayCanDots(20)).toBeLessThan(Math.round(10 * 10 * 0.6))
    expect(SPRAY_TICK_MS).toBeGreaterThan(0)
  })

  it('builds up density with each tick on the same spot, inside the circle', () => {
    const bitmap = new Bitmap(60, 60, WHITE)
    const random = seededRandom(3)
    const counts: number[] = []
    for (let tick = 0; tick < 12; tick += 1) {
      sprayDab(bitmap, { x: 30, y: 30 }, 30, BLACK, random, sprayCanDots(30))
      counts.push(painted(bitmap))
    }
    expect(counts[11]).toBeGreaterThan(counts[0] * 3)
    for (let y = 0; y < 60; y += 1) {
      for (let x = 0; x < 60; x += 1) {
        if (bitmap.get(x, y).r < 255) expect(Math.hypot(x - 30, y - 30)).toBeLessThanOrEqual(15.75)
      }
    }
  })

  it('paints one puff per segment end with paintBrushStroke', () => {
    const a = new Bitmap(40, 40, WHITE)
    paintBrushStroke(a, { x: 10, y: 20 }, { x: 30, y: 20 }, { size: 10, color: BLACK, brush: 'spray', random: seededRandom(5) })
    expect(painted(a)).toBeGreaterThan(0)
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        if (a.get(x, y).r < 255) expect(Math.hypot(x - 30, y - 20)).toBeLessThanOrEqual(5.75)
      }
    }
  })
})

describe('pixelate', () => {
  /** A fine checkerboard of black and white pixels. */
  const checker = (w: number, h: number) => {
    const bitmap = new Bitmap(w, h, WHITE)
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if ((x + y) % 2 === 0) bitmap.set(x, y, BLACK)
    return bitmap
  }

  it('only moves pixels around', () => {
    expect(isColorBrush('pixelate')).toBe(false)
  })

  it('derives the block size from the brush size', () => {
    expect(pixelateBlockSize(1)).toBe(2)
    expect(pixelateBlockSize(4)).toBe(2)
    expect(pixelateBlockSize(16)).toBe(4)
    expect(pixelateBlockSize(40)).toBe(10)
    expect(pixelateBlockSize(500)).toBe(125)
  })

  it('fills each covered block with the average colour of its pixels', () => {
    const source = checker(40, 40)
    const bitmap = source.clone()
    pixelateDab(bitmap, source, { x: 20, y: 20 }, 16)
    // Block size 4: a 4x4 checker block averages to mid grey.
    const p = bitmap.get(20, 20)
    expect(Math.abs(p.r - 127.5)).toBeLessThanOrEqual(1)
    expect(p.a).toBe(255)
    // The whole block containing (20, 20), i.e. 20..23, is one colour.
    for (let y = 20; y < 24; y += 1) for (let x = 20; x < 24; x += 1) expect(bitmap.get(x, y)).toEqual(p)
    // Far outside the dab nothing changed.
    expect(bitmap.get(0, 0)).toEqual(source.get(0, 0))
    expect(bitmap.get(39, 39)).toEqual(source.get(39, 39))
  })

  it('averages to the real block colour', () => {
    const source = new Bitmap(16, 16, WHITE)
    // Block (4..7, 4..7): one quarter red.
    for (let y = 4; y < 6; y += 1) for (let x = 4; x < 6; x += 1) source.set(x, y, { r: 255, g: 0, b: 0, a: 255 })
    const bitmap = source.clone()
    pixelateDab(bitmap, source, { x: 6, y: 6 }, 16)
    const p = bitmap.get(7, 7)
    expect(p.r).toBe(255)
    expect(Math.abs(p.g - 191)).toBeLessThanOrEqual(1)
  })

  it('aligns blocks to one grid across the image', () => {
    const source = checker(48, 48)
    const a = source.clone()
    pixelateDab(a, source, { x: 21, y: 22 }, 16)
    const b = source.clone()
    pixelateDab(b, source, { x: 23, y: 19 }, 16)
    // Pixels changed by both dabs agree, because both use the same block grid.
    for (let y = 0; y < 48; y += 1) {
      for (let x = 0; x < 48; x += 1) {
        const changedA = a.get(x, y).r !== source.get(x, y).r
        const changedB = b.get(x, y).r !== source.get(x, y).r
        if (changedA && changedB) expect(a.get(x, y)).toEqual(b.get(x, y))
      }
    }
  })

  it('does not smear when dabs of one stroke overlap', () => {
    const source = checker(60, 30)
    const once = source.clone()
    pixelateDab(once, source, { x: 30, y: 15 }, 20)
    const again = once.clone()
    for (let i = 0; i < 5; i += 1) pixelateDab(again, source, { x: 30 + i, y: 15 }, 20)
    for (let y = 0; y < 30; y += 1) {
      for (let x = 0; x < 60; x += 1) {
        if (once.get(x, y).r !== source.get(x, y).r) expect(again.get(x, y)).toEqual(once.get(x, y))
      }
    }
  })

  it('pixelates along a stroke from the stroke-start pixels', () => {
    const source = checker(60, 30)
    const bitmap = source.clone()
    paintBrushStroke(bitmap, { x: 10, y: 15 }, { x: 50, y: 15 }, { size: 12, color: BLACK, brush: 'pixelate', source })
    // Block size 3; every covered block is one flat colour.
    const grey = bitmap.get(30, 15)
    expect(grey.r).toBeGreaterThan(80)
    expect(grey.r).toBeLessThan(180)
    expect(bitmap.get(0, 0)).toEqual(source.get(0, 0))
  })
})
