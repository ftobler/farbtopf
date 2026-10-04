import { describe, expect, it } from 'vitest'
import { ROTATE_HANDLE_OFFSET, rectCentre, rotateAround, rotateHandlePoint, rotationToward, unrotateAround } from './rotation'

const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  expect(actual.x).toBeCloseTo(expected.x, 9)
  expect(actual.y).toBeCloseTo(expected.y, 9)
}

describe('rotateAround', () => {
  it('turns a point clockwise (on screen) about the centre', () => {
    close(rotateAround({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2), { x: 0, y: 10 })
    close(rotateAround({ x: 15, y: 5 }, { x: 5, y: 5 }, Math.PI), { x: -5, y: 5 })
  })

  it('leaves the point alone at 0', () => {
    expect(rotateAround({ x: 3, y: 4 }, { x: 1, y: 1 }, 0)).toEqual({ x: 3, y: 4 })
  })

  it('is undone by unrotateAround', () => {
    const centre = { x: 7, y: -2 }
    const turned = rotateAround({ x: 20, y: 11 }, centre, 0.7)
    close(unrotateAround(turned, centre, 0.7), { x: 20, y: 11 })
  })
})

describe('rotationToward', () => {
  it('is 0 straight above the centre and grows clockwise', () => {
    const centre = { x: 50, y: 50 }
    expect(rotationToward(centre, { x: 50, y: 10 })).toBeCloseTo(0, 9)
    expect(rotationToward(centre, { x: 90, y: 50 })).toBeCloseTo(Math.PI / 2, 9)
    expect(rotationToward(centre, { x: 50, y: 90 })).toBeCloseTo(Math.PI, 9)
  })

  it('is 0 straight left of the centre for a left handle, growing clockwise', () => {
    const centre = { x: 50, y: 50 }
    expect(rotationToward(centre, { x: 10, y: 50 }, 'left')).toBeCloseTo(0, 9)
    expect(rotationToward(centre, { x: 50, y: 10 }, 'left')).toBeCloseTo(Math.PI / 2, 9)
    expect(rotationToward(centre, { x: 90, y: 50 }, 'left')).toBeCloseTo(Math.PI, 9)
    expect(rotationToward(centre, { x: 50, y: 90 }, 'left')).toBeCloseTo(-Math.PI / 2, 9)
    // Just below the left side is a hair anticlockwise, not almost a full turn.
    expect(rotationToward(centre, { x: 10, y: 51 }, 'left')).toBeCloseTo(-Math.atan2(1, 40), 9)
  })

  it('maps the handle point back to the angle it came from', () => {
    const box = { x: 10, y: 20, width: 40, height: 20 }
    for (const side of ['top', 'left'] as const) {
      for (const angle of [0, 0.4, 1.9, -2.5]) {
        const toward = rotationToward(rectCentre(box), rotateHandlePoint(box, angle, side), side)
        expect(Math.cos(toward)).toBeCloseTo(Math.cos(angle), 9)
        expect(Math.sin(toward)).toBeCloseTo(Math.sin(angle), 9)
      }
    }
  })
})

describe('rotateHandlePoint', () => {
  it('sits the handle offset above the top edge, turned with the box', () => {
    const box = { x: 10, y: 20, width: 40, height: 20 }
    expect(rectCentre(box)).toEqual({ x: 30, y: 30 })
    close(rotateHandlePoint(box, 0), { x: 30, y: 20 - ROTATE_HANDLE_OFFSET })
    close(rotateHandlePoint(box, Math.PI / 2), { x: 30 + 10 + ROTATE_HANDLE_OFFSET, y: 30 })
  })

  it('sits a left handle the offset left of the left edge, vertically centred, turned with the box', () => {
    const box = { x: 10, y: 20, width: 40, height: 20 }
    close(rotateHandlePoint(box, 0, 'left'), { x: 10 - ROTATE_HANDLE_OFFSET, y: 30 })
    close(rotateHandlePoint(box, Math.PI / 2, 'left'), { x: 30, y: 30 - 20 - ROTATE_HANDLE_OFFSET })
  })
})
