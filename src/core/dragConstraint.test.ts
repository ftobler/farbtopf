import { describe, expect, it } from 'vitest'
import { constrainDrag, dragLineEnd, dragModeFor, dragModifiers, keepAspect } from './dragConstraint'

const NONE = { constrain: false, fromCentre: false }
const SHIFT = { constrain: true, fromCentre: false }
const CTRL = { constrain: false, fromCentre: true }
const BOTH = { constrain: true, fromCentre: true }

describe('dragModifiers', () => {
  it('reads Shift as constrain and Ctrl or Meta as from-centre', () => {
    expect(dragModifiers({ shiftKey: false, ctrlKey: false, metaKey: false })).toEqual(NONE)
    expect(dragModifiers({ shiftKey: true, ctrlKey: false, metaKey: false })).toEqual(SHIFT)
    expect(dragModifiers({ shiftKey: false, ctrlKey: true, metaKey: false })).toEqual(CTRL)
    expect(dragModifiers({ shiftKey: false, ctrlKey: false, metaKey: true })).toEqual(CTRL)
    expect(dragModifiers({ shiftKey: true, ctrlKey: true, metaKey: false })).toEqual(BOTH)
  })
})

describe('dragModeFor', () => {
  it('treats the line and the curve as lines and every other drag shape as a box', () => {
    expect(dragModeFor('line')).toBe('line')
    expect(dragModeFor('polyline')).toBe('line')
    expect(dragModeFor('rectangle')).toBe('box')
    expect(dragModeFor('ellipse')).toBe('box')
    expect(dragModeFor('arrow')).toBe('box')
    expect(dragModeFor('star-5')).toBe('box')
  })
})

describe('constrainDrag for boxes', () => {
  it('leaves the drag alone without modifiers', () => {
    expect(constrainDrag({ x: 2, y: 3 }, { x: 10, y: 5 }, 'box', NONE)).toEqual({
      start: { x: 2, y: 3 },
      end: { x: 10, y: 5 },
    })
  })

  it('makes a square from the larger side with Shift', () => {
    expect(constrainDrag({ x: 2, y: 3 }, { x: 10, y: 5 }, 'box', SHIFT)).toEqual({
      start: { x: 2, y: 3 },
      end: { x: 10, y: 11 },
    })
    expect(constrainDrag({ x: 2, y: 3 }, { x: 4, y: 13 }, 'box', SHIFT).end).toEqual({ x: 12, y: 13 })
  })

  it('keeps the drag direction of each axis when squaring', () => {
    expect(constrainDrag({ x: 10, y: 10 }, { x: 4, y: 12 }, 'box', SHIFT).end).toEqual({ x: 4, y: 16 })
    expect(constrainDrag({ x: 10, y: 10 }, { x: 12, y: 2 }, 'box', SHIFT).end).toEqual({ x: 18, y: 2 })
    expect(constrainDrag({ x: 10, y: 10 }, { x: 7, y: 5 }, 'box', SHIFT).end).toEqual({ x: 5, y: 5 })
  })

  it('squares a drag along one axis', () => {
    expect(constrainDrag({ x: 10, y: 10 }, { x: 10, y: 4 }, 'box', SHIFT).end).toEqual({ x: 16, y: 4 })
  })

  it('centres the box on the start point with Ctrl', () => {
    expect(constrainDrag({ x: 10, y: 10 }, { x: 14, y: 12 }, 'box', CTRL)).toEqual({
      start: { x: 6, y: 8 },
      end: { x: 14, y: 12 },
    })
  })

  it('centres a square on the start point with Shift and Ctrl', () => {
    expect(constrainDrag({ x: 10, y: 10 }, { x: 14, y: 7 }, 'box', BOTH)).toEqual({
      start: { x: 6, y: 14 },
      end: { x: 14, y: 6 },
    })
  })
})

describe('constrainDrag for lines', () => {
  it('snaps a nearly horizontal or vertical line onto the axis with Shift', () => {
    expect(constrainDrag({ x: 0, y: 0 }, { x: 10, y: 2 }, 'line', SHIFT).end).toEqual({ x: 10, y: 0 })
    expect(constrainDrag({ x: 5, y: 5 }, { x: 4, y: -7 }, 'line', SHIFT).end).toEqual({ x: 5, y: -7 })
  })

  it('snaps a nearly diagonal line onto 45 degrees with Shift', () => {
    expect(constrainDrag({ x: 0, y: 0 }, { x: 10, y: 8 }, 'line', SHIFT).end).toEqual({ x: 9, y: 9 })
    expect(constrainDrag({ x: 0, y: 0 }, { x: -10, y: 8 }, 'line', SHIFT).end).toEqual({ x: -9, y: 9 })
    expect(constrainDrag({ x: 0, y: 0 }, { x: 6, y: -6 }, 'line', SHIFT).end).toEqual({ x: 6, y: -6 })
  })

  it('does not square a line', () => {
    expect(constrainDrag({ x: 0, y: 0 }, { x: 10, y: 0 }, 'line', SHIFT).end).toEqual({ x: 10, y: 0 })
  })

  it('makes the start point the midpoint with Ctrl', () => {
    expect(constrainDrag({ x: 10, y: 10 }, { x: 13, y: 14 }, 'line', CTRL)).toEqual({
      start: { x: 7, y: 6 },
      end: { x: 13, y: 14 },
    })
  })

  it('snaps and centres together', () => {
    expect(constrainDrag({ x: 10, y: 10 }, { x: 15, y: 11 }, 'line', BOTH)).toEqual({
      start: { x: 5, y: 10 },
      end: { x: 15, y: 10 },
    })
  })

  it('leaves a zero-length drag alone', () => {
    expect(constrainDrag({ x: 3, y: 3 }, { x: 3, y: 3 }, 'line', BOTH)).toEqual({
      start: { x: 3, y: 3 },
      end: { x: 3, y: 3 },
    })
  })
})

describe('keepAspect', () => {
  it('keeps the dragged corner on the diagonal through the fixed corner', () => {
    // A 10 x 5 box anchored at the origin.
    expect(keepAspect({ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 6 })).toEqual({ x: 18, y: 9 })
    expect(keepAspect({ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 10 })).toEqual({ x: 20, y: 10 })
  })

  it('works for a corner on the other side of the anchor', () => {
    expect(keepAspect({ x: 10, y: 10 }, { x: 0, y: 0 }, { x: -2, y: 4 })).toEqual({ x: 1, y: 1 })
  })

  it('returns the point unchanged for a degenerate box', () => {
    expect(keepAspect({ x: 3, y: 3 }, { x: 3, y: 3 }, { x: 7, y: 9 })).toEqual({ x: 7, y: 9 })
  })
})

describe('dragLineEnd', () => {
  const other = { x: 0, y: 0 }
  const grabbed = { x: 10, y: 0 }

  it('moves the grabbed end to the pointer and leaves the other end alone', () => {
    expect(dragLineEnd(other, grabbed, { x: 7, y: 9 }, NONE)).toEqual({ other, grabbed: { x: 7, y: 9 } })
  })

  it('snaps the line to 45 degree steps around the other end with Shift', () => {
    expect(dragLineEnd(other, grabbed, { x: 20, y: 3 }, SHIFT)).toEqual({ other, grabbed: { x: 20, y: 0 } })
    expect(dragLineEnd(other, grabbed, { x: 10, y: 9 }, SHIFT)).toEqual({ other, grabbed: { x: 10, y: 10 } })
    expect(dragLineEnd(other, grabbed, { x: -1, y: -12 }, SHIFT)).toEqual({ other, grabbed: { x: 0, y: -12 } })
  })

  it('mirrors the other end about the midpoint the line had when grabbed with Ctrl', () => {
    expect(dragLineEnd(other, grabbed, { x: 12, y: 4 }, CTRL)).toEqual({
      other: { x: -2, y: -4 },
      grabbed: { x: 12, y: 4 },
    })
  })

  it('keeps a half-pixel midpoint exact with Ctrl', () => {
    const result = dragLineEnd({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 8, y: 2 }, CTRL)
    expect(result).toEqual({ other: { x: -3, y: -2 }, grabbed: { x: 8, y: 2 } })
  })

  it('snaps around the midpoint with Shift and Ctrl together', () => {
    expect(dragLineEnd(other, grabbed, { x: 14, y: 1 }, BOTH)).toEqual({
      other: { x: -4, y: 0 },
      grabbed: { x: 14, y: 0 },
    })
  })
})
