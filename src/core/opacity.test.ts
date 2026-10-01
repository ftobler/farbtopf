import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BLACK, TRANSPARENT, WHITE, rgba } from './color'
import { blendToward } from './opacity'

const RED = rgba(255, 0, 0)

describe('blendToward', () => {
  it('copies the full-strength stroke at 100 %', () => {
    const base = new Bitmap(4, 4, WHITE)
    const work = base.clone()
    work.set(1, 1, BLACK)
    const target = base.clone()
    blendToward(target, base, work, 1)
    expect(target.get(1, 1)).toEqual(BLACK)
    expect(target.get(0, 0)).toEqual(WHITE)
  })

  it('mixes an opaque stroke over an opaque base', () => {
    const base = new Bitmap(4, 4, WHITE)
    const work = base.clone()
    work.set(2, 2, BLACK)
    const target = base.clone()
    blendToward(target, base, work, 0.5)
    const p = target.get(2, 2)
    expect(p.a).toBe(255)
    expect(p.r).toBeGreaterThanOrEqual(127)
    expect(p.r).toBeLessThanOrEqual(128)
  })

  it('keeps the stroke colour over transparency, only lowering its alpha', () => {
    const base = new Bitmap(2, 2)
    const work = base.clone()
    work.set(0, 0, RED)
    const target = base.clone()
    blendToward(target, base, work, 0.25)
    const p = target.get(0, 0)
    expect(p.r).toBe(255)
    expect(p.g).toBe(0)
    expect(Math.abs(p.a - 64)).toBeLessThanOrEqual(1)
  })

  it('partially erases toward transparency', () => {
    const base = new Bitmap(2, 2, RED)
    const work = base.clone()
    work.set(1, 0, TRANSPARENT)
    const target = base.clone()
    blendToward(target, base, work, 0.5)
    const p = target.get(1, 0)
    expect(p.r).toBe(255)
    expect(Math.abs(p.a - 128)).toBeLessThanOrEqual(1)
  })

  it('leaves a pixel fully transparent black when the blend has no alpha', () => {
    const base = new Bitmap(2, 1)
    base.set(0, 0, rgba(10, 20, 30, 0))
    const work = new Bitmap(2, 1, RED)
    const target = new Bitmap(2, 1, WHITE)
    blendToward(target, base, work, 0)
    expect(target.get(0, 0)).toEqual(TRANSPARENT)
    expect(target.get(1, 0)).toEqual(TRANSPARENT)
  })

  it('restores untouched pixels from the base', () => {
    const base = new Bitmap(3, 3, WHITE)
    const work = base.clone()
    const target = new Bitmap(3, 3, BLACK)
    blendToward(target, base, work, 0.5)
    expect(target.get(1, 1)).toEqual(WHITE)
  })

  it('only touches pixels inside the given rectangle', () => {
    const base = new Bitmap(6, 6, WHITE)
    const work = new Bitmap(6, 6, BLACK)
    const target = base.clone()
    blendToward(target, base, work, 1, { x: 1, y: 1, width: 2, height: 2 })
    expect(target.get(1, 1)).toEqual(BLACK)
    expect(target.get(2, 2)).toEqual(BLACK)
    expect(target.get(3, 3)).toEqual(WHITE)
    expect(target.get(0, 0)).toEqual(WHITE)
  })

  it('clips a rectangle that reaches past the edges', () => {
    const base = new Bitmap(4, 4, WHITE)
    const work = new Bitmap(4, 4, BLACK)
    const target = base.clone()
    blendToward(target, base, work, 1, { x: -10, y: 2, width: 100, height: 100 })
    expect(target.get(0, 3)).toEqual(BLACK)
    expect(target.get(3, 1)).toEqual(WHITE)
  })

  it('gives overlapping parts of one stroke the same opacity', () => {
    // The stroke itself is painted at full strength, so painting a pixel twice
    // in the work buffer changes nothing; the blend is applied exactly once.
    const base = new Bitmap(4, 1, WHITE)
    const work = base.clone()
    work.set(0, 0, BLACK)
    work.set(1, 0, BLACK)
    work.set(1, 0, BLACK)
    const target = base.clone()
    blendToward(target, base, work, 0.4)
    expect(target.get(0, 0)).toEqual(target.get(1, 0))
  })
})
