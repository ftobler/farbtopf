import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import { BLACK, TRANSPARENT, WHITE } from './color'
import { compositeLayers, moveItem, thumbnail } from './layers'

describe('compositeLayers', () => {
  it('draws the bottom-most layer first', () => {
    const bottom = new Bitmap(2, 1, WHITE)
    const top = new Bitmap(2, 1)
    top.set(1, 0, BLACK)
    const result = compositeLayers([bottom, top])!
    expect(result.get(0, 0)).toEqual(WHITE)
    expect(result.get(1, 0)).toEqual(BLACK)
  })

  it('lets an opaque upper layer hide everything below it', () => {
    const result = compositeLayers([new Bitmap(1, 1, BLACK), new Bitmap(1, 1, WHITE)])!
    expect(result.get(0, 0)).toEqual(WHITE)
  })

  it('blends translucent pixels over the layers below', () => {
    const top = new Bitmap(1, 1, { r: 0, g: 0, b: 0, a: 128 })
    const pixel = compositeLayers([new Bitmap(1, 1, WHITE), top])!.get(0, 0)
    expect(pixel.a).toBe(255)
    expect(pixel.r).toBeGreaterThan(120)
    expect(pixel.r).toBeLessThan(135)
  })

  it('leaves pixels transparent where no layer paints', () => {
    const result = compositeLayers([new Bitmap(1, 1), new Bitmap(1, 1)])!
    expect(result.get(0, 0)).toEqual(TRANSPARENT)
  })

  it('does not modify the source layers', () => {
    const bottom = new Bitmap(1, 1, WHITE)
    const top = new Bitmap(1, 1, BLACK)
    compositeLayers([bottom, top])
    expect(bottom.get(0, 0)).toEqual(WHITE)
  })

  it('returns null for an empty stack', () => {
    expect(compositeLayers([])).toBeNull()
  })
})

describe('thumbnail', () => {
  it('shrinks the longer edge to the thumbnail size, keeping the aspect ratio', () => {
    const small = thumbnail(new Bitmap(200, 100), 64)
    expect([small.width, small.height]).toEqual([64, 32])
  })

  it('never enlarges a small bitmap', () => {
    const small = thumbnail(new Bitmap(10, 5), 64)
    expect([small.width, small.height]).toEqual([10, 5])
  })

  it('keeps the picture', () => {
    const source = new Bitmap(4, 4, WHITE)
    for (let y = 0; y < 2; y += 1) for (let x = 0; x < 2; x += 1) source.set(x, y, BLACK)
    const small = thumbnail(source, 2)
    expect(small.get(0, 0)).toEqual(BLACK)
    expect(small.get(1, 1)).toEqual(WHITE)
  })
})

describe('moveItem', () => {
  it('moves an item up the list', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item down the list', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('clamps the target index and leaves the input untouched', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 1, 9)).toEqual(['a', 'c', 'b'])
    expect(moveItem(list, 1, -3)).toEqual(['b', 'a', 'c'])
    expect(list).toEqual(['a', 'b', 'c'])
  })
})
