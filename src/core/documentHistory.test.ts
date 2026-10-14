import { describe, expect, it } from 'vitest'
import { Bitmap } from './bitmap'
import {
  DocumentHistory,
  HISTORY_LIMIT,
  HISTORY_MAX_BYTES,
  type DocSnapshot,
  snapshotBytes,
  stackBytes,
} from './documentHistory'
import type { Layer } from './layers'
import { seededRandom } from './random'

const grey = (value: number) => ({ r: value, g: value, b: value, a: 255 })

const layer = (id: number, width = 2, height = 2, value = 0): Layer => ({
  id,
  name: `Layer ${id}`,
  bitmap: new Bitmap(width, height, grey(value)),
})

/** The grey value of the first pixel, which the tests use as a layer's "content". */
const valueOf = (bitmap: Bitmap) => bitmap.data[0]

const paint = (bitmap: Bitmap, value: number) => bitmap.fill(grey(value))

const values = (snapshot: DocSnapshot | undefined) => snapshot?.layers.map((entry) => valueOf(entry.bitmap))

describe('snapshotBytes', () => {
  it('counts only the active layer bitmap', () => {
    expect(snapshotBytes({ layers: [layer(1, 4, 4), layer(2, 2, 2)], active: 1 })).toBe(2 * 2 * 4)
  })

  it('counts the first layer when it is active', () => {
    expect(snapshotBytes({ layers: [layer(1, 4, 4), layer(2, 2, 2)], active: 0 })).toBe(4 * 4 * 4)
  })

  it('returns zero when the active layer is missing', () => {
    expect(snapshotBytes({ layers: [layer(1, 4, 4)], active: 5 })).toBe(0)
  })

  it('honors an explicit byte override regardless of layer size', () => {
    expect(snapshotBytes({ layers: [layer(1, 4, 4), layer(2, 2, 2)], active: 1, bytes: 999 })).toBe(999)
  })
})

describe('stackBytes', () => {
  it('sums width * height * 4 across all layers', () => {
    expect(stackBytes([layer(1, 2, 2), layer(2, 3, 1)])).toBe((4 + 3) * 4)
  })

  it('returns zero for an empty stack', () => {
    expect(stackBytes([])).toBe(0)
  })

  it('counts a bitmap shared by two layers once', () => {
    const shared = layer(1, 2, 2)
    expect(stackBytes([shared, { ...shared, id: 2 }])).toBe(2 * 2 * 4)
  })
})

/**
 * What an undo step of the document is: the snapshot contents, the active layer
 * it restores, its byte cost per step type and the aliasing invariant. The stack
 * itself (order, limit, eviction) is covered in history.test.ts; here it is only
 * checked that the options reach it.
 */
describe('DocumentHistory', () => {
  it('uses the editor limits by default', () => {
    expect(HISTORY_LIMIT).toBeGreaterThan(0)
    expect(HISTORY_MAX_BYTES).toBeGreaterThan(0)
    const history = new DocumentHistory()
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) history.record([layer(1)], 0)
    expect(history.depth).toBe(HISTORY_LIMIT)
  })

  it('starts empty', () => {
    const history = new DocumentHistory()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
    expect(history.undo([layer(1)], 0)).toBeUndefined()
    expect(history.redo([layer(1)], 0)).toBeUndefined()
  })

  it('records the active layer as it is before an in-place edit', () => {
    const history = new DocumentHistory()
    const live = [layer(1, 2, 2, 10)]
    history.record(live, 0)
    paint(live[0].bitmap, 20)
    const previous = history.undo(live, 0)
    expect(values(previous)).toEqual([10])
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
  })

  it('records a given before-bitmap of the active layer as is', () => {
    const history = new DocumentHistory()
    const before = new Bitmap(2, 2, grey(5))
    const live = [layer(1, 2, 2, 30), layer(2, 2, 2, 40)]
    history.record(live, 1, before)
    const previous = history.undo(live, 1)!
    expect(values(previous)).toEqual([30, 5])
    // The before-bitmap is not retained anywhere else, so it is handed out without a copy.
    expect(previous.layers[1].bitmap).toBe(before)
    // Layers other than the active one are shared with the live stack, not copied.
    expect(previous.layers[0].bitmap).toBe(live[0].bitmap)
  })

  it('redoes back to the state undo started from', () => {
    const history = new DocumentHistory()
    let live = [layer(1, 2, 2, 10)]
    history.record(live, 0)
    paint(live[0].bitmap, 20)
    const previous = history.undo(live, 0)!
    live = [...previous.layers]
    const next = history.redo(live, previous.active)!
    expect(values(next)).toEqual([20])
    expect(history.canRedo).toBe(false)
    expect(history.canUndo).toBe(true)
  })

  it('stops retaining the bitmaps of redo states a new record drops', () => {
    const history = new DocumentHistory()
    const live = [layer(1, 2, 2, 10)]
    history.record(live, 0)
    const undone = live[0].bitmap
    const previous = history.undo(live, 0)!
    expect(history.retains(undone)).toBe(true)
    history.record(previous.layers, 0)
    expect(history.canRedo).toBe(false)
    expect(history.retains(undone)).toBe(false)
  })

  it('restores which layer was active', () => {
    const history = new DocumentHistory()
    const live = [layer(1), layer(2)]
    history.record(live, 0)
    const added = history.isolate([...live, layer(3)], 2)
    const previous = history.undo(added, 2)!
    expect(previous.active).toBe(0)
    expect(previous.layers.map((entry) => entry.id)).toEqual([1, 2])
    const next = history.redo(history.isolate(previous.layers, previous.active), previous.active)!
    expect(next.active).toBe(2)
    expect(next.layers.map((entry) => entry.id)).toEqual([1, 2, 3])
  })

  it('restores the document size of a whole-stack step', () => {
    const history = new DocumentHistory()
    const live = [layer(1, 4, 4, 10), layer(2, 4, 4, 20)]
    const resized = history.transformStack(live, 1, (bitmap) => new Bitmap(8, 2, grey(valueOf(bitmap) + 1)))
    expect(resized.map((entry) => [entry.bitmap.width, entry.bitmap.height, valueOf(entry.bitmap)])).toEqual([
      [8, 2, 11],
      [8, 2, 21],
    ])
    const previous = history.undo(resized, 1)!
    expect(previous.layers.map((entry) => [entry.bitmap.width, entry.bitmap.height])).toEqual([
      [4, 4],
      [4, 4],
    ])
    expect(values(previous)).toEqual([10, 20])
    const next = history.redo(previous.layers, previous.active)!
    expect(next.layers[0].bitmap.width).toBe(8)
  })

  it('tells the transform which layer is the bottom one', () => {
    const history = new DocumentHistory()
    const bottoms: boolean[] = []
    history.transformStack([layer(1), layer(2), layer(3)], 0, (bitmap, bottom) => {
      bottoms.push(bottom)
      return bitmap.clone()
    })
    expect(bottoms).toEqual([true, false, false])
  })

  describe('byte accounting', () => {
    it('charges a normal step for the active layer only', () => {
      const history = new DocumentHistory()
      history.record([layer(1, 10, 10), layer(2, 4, 4)], 1)
      expect(history.bytes).toBe(4 * 4 * 4)
    })

    it('charges a whole-stack step for every layer', () => {
      const history = new DocumentHistory()
      history.transformStack([layer(1, 10, 10), layer(2, 10, 10)], 0, (bitmap) => bitmap.clone())
      expect(history.bytes).toBe(2 * 10 * 10 * 4)
    })

    it('charges an explicitly recorded stack for every layer', () => {
      const history = new DocumentHistory()
      history.recordStack([layer(1, 10, 10), layer(2, 5, 5)], 0)
      expect(history.bytes).toBe((100 + 25) * 4)
    })

    it('charges the redo state for the bitmaps undo takes out of the live stack', () => {
      const history = new DocumentHistory()
      const live = [layer(1, 10, 10), layer(2, 4, 4)]
      history.record(live, 1)
      // Undoing an active-layer step only swaps the active bitmap out of the live stack.
      history.undo(live, 1)
      expect(history.bytes).toBe(4 * 4 * 4)
    })

    it('charges the redo state of a whole-stack step for every layer', () => {
      const history = new DocumentHistory()
      const resized = history.transformStack([layer(1, 4, 4), layer(2, 4, 4)], 0, () => new Bitmap(10, 10))
      expect(history.bytes).toBe(2 * 4 * 4 * 4)
      history.undo(resized, 0)
      expect(history.bytes).toBe(2 * 10 * 10 * 4)
      expect(history.canUndo).toBe(false)
    })

    it('evicts the oldest steps beyond the byte budget', () => {
      const history = new DocumentHistory({ maxBytes: 3 * 4 * 4 * 4 })
      const live = [layer(1, 4, 4, 1)]
      for (let value = 1; value <= 5; value += 1) {
        history.record(live, 0)
        paint(live[0].bitmap, value + 1)
      }
      expect(history.depth).toBe(3)
      const seen: number[] = []
      let current: readonly Layer[] = live
      for (let snapshot = history.undo(current, 0); snapshot; snapshot = history.undo(current, 0)) {
        seen.push(valueOf(snapshot.layers[0].bitmap))
        current = snapshot.layers
      }
      expect(seen).toEqual([5, 4, 3])
    })

    it('charges the redo state only for the bitmaps the restored step does not hold', () => {
      const history = new DocumentHistory()
      const live = [layer(1, 10, 10), layer(2, 4, 4)]
      history.record(live, 1)
      const added = history.isolate([...live, layer(3, 3, 3)], 2)
      // The restored step shares the bottom layer and holds its own copy of layer 2.
      history.undo(added, 2)
      expect(history.bytes).toBe((4 * 4 + 3 * 3) * 4)
    })

    it('charges nothing for a redo state whose bitmaps the restored step all holds', () => {
      const history = new DocumentHistory()
      const live = [layer(1, 4, 4), layer(2, 4, 4)]
      history.recordStack(live, 0)
      history.undo(live, 0)
      expect(history.bytes).toBe(0)
      expect(history.canRedo).toBe(true)
    })

    it('leaves the bytes alone on an undo or redo with nothing to take back', () => {
      const history = new DocumentHistory()
      const live = [layer(1, 4, 4)]
      history.record(live, 0)
      const recorded = history.bytes
      expect(history.redo(live, 0)).toBeUndefined()
      expect(history.bytes).toBe(recorded)
      const previous = history.undo(live, 0)!
      const undone = history.bytes
      expect(history.undo(previous.layers, 0)).toBeUndefined()
      expect(history.bytes).toBe(undone)
      expect(history.canRedo).toBe(true)
    })

    it('honours a custom step limit', () => {
      const history = new DocumentHistory({ limit: 2 })
      for (let i = 0; i < 5; i += 1) history.record([layer(1)], 0)
      expect(history.depth).toBe(2)
    })
  })

  it('forgets every step on reset', () => {
    const history = new DocumentHistory()
    const live = [layer(1)]
    history.record(live, 0)
    history.record(live, 0)
    history.undo(live, 0)
    history.reset()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
    expect(history.bytes).toBe(0)
  })

  describe('aliasing', () => {
    it('copies the live surface when it is passed as the before-bitmap', () => {
      const history = new DocumentHistory()
      const live = [layer(1, 2, 2, 10)]
      history.record(live, 0, live[0].bitmap)
      expect(history.retains(live[0].bitmap)).toBe(false)
      paint(live[0].bitmap, 20)
      expect(values(history.undo(live, 0))).toEqual([10])
    })

    it('does not share the live surface with the recorded step', () => {
      const history = new DocumentHistory()
      const live = [layer(1), layer(2)]
      history.record(live, 1)
      expect(history.retains(live[1].bitmap)).toBe(false)
      // The inactive layer is shared deliberately: only the active one is painted in place.
      expect(history.retains(live[0].bitmap)).toBe(true)
    })

    it('copies a layer that becomes active while an undo step still holds it', () => {
      const history = new DocumentHistory()
      const live = [layer(1, 2, 2, 10), layer(2, 2, 2, 20)]
      history.record(live, 1)
      const selected = history.isolate(live, 0)
      expect(selected[0].bitmap).not.toBe(live[0].bitmap)
      expect(valueOf(selected[0].bitmap)).toBe(10)
      expect(selected[1].bitmap).toBe(live[1].bitmap)
      expect(selected).not.toBe(live)
    })

    it('retains the live bitmaps undo moves into the redo state, and hands them back uncopied on redo', () => {
      const history = new DocumentHistory()
      const live = [layer(1, 2, 2, 10), layer(2, 2, 2, 20)]
      history.record(live, 1)
      paint(live[1].bitmap, 30)
      const previous = history.undo(live, 1)!
      expect(history.retains(live[1].bitmap)).toBe(true)
      expect(history.retains(previous.layers[1].bitmap)).toBe(false)
      const next = history.redo(previous.layers, previous.active)!
      // Once redone no state holds that bitmap any more, so it needs no copy.
      expect(next.layers[1].bitmap).toBe(live[1].bitmap)
      expect(history.retains(next.layers[1].bitmap)).toBe(false)
      expect(values(next)).toEqual([10, 30])
    })

    it('hands back the layers unchanged when the active index is out of range', () => {
      const history = new DocumentHistory()
      const live = [layer(1), layer(2)]
      history.record(live, 0)
      const isolated = history.isolate(live, 5)
      expect(isolated).not.toBe(live)
      expect(isolated).toEqual(live)
      expect(isolated[0]).toBe(live[0])
    })

    it('does not copy a layer that becomes active while no step holds it', () => {
      const history = new DocumentHistory()
      const live = [layer(1), layer(2)]
      expect(history.isolate(live, 1)[1].bitmap).toBe(live[1].bitmap)
      history.record(live, 0)
      const added = [...live, layer(3)]
      expect(history.isolate(added, 2)[2].bitmap).toBe(added[2].bitmap)
    })

    it('copies a transformed layer that is still the recorded bitmap', () => {
      const history = new DocumentHistory()
      const live = [layer(1, 2, 2, 10), layer(2, 2, 2, 20)]
      const next = history.transformStack(live, 1, (bitmap) => bitmap)
      expect(history.retains(next[1].bitmap)).toBe(false)
      paint(next[1].bitmap, 99)
      expect(values(history.undo(next, 1))).toEqual([10, 20])
    })

    it('copies a handed-out active bitmap that another retained step still shares', () => {
      const history = new DocumentHistory()
      const shared = new Bitmap(2, 2, grey(7))
      const live = [layer(1, 2, 2, 10)]
      history.record(live, 0, shared)
      history.record(live, 0, shared)
      const previous = history.undo(live, 0)!
      expect(previous.layers[0].bitmap).not.toBe(shared)
      expect(valueOf(previous.layers[0].bitmap)).toBe(7)
      paint(previous.layers[0].bitmap, 99)
      expect(values(history.undo(previous.layers, 0))).toEqual([7])
    })

    /**
     * Drives the history the way the editor does, through a seeded random mix of
     * edits, layer changes, whole-stack steps, undo and redo, and paints the live
     * surface in place after every operation. Every retained step must keep its
     * pixels, and every undo or redo must hand back exactly what was recorded.
     */
    it('never lets the live surface reach into a retained step', () => {
      for (let seed = 1; seed <= 25; seed += 1) {
        const random = seededRandom(seed)
        const pick = (n: number) => Math.floor(random() * n)
        const history = new DocumentHistory({ limit: 1000, maxBytes: Number.MAX_SAFE_INTEGER })
        let live: Layer[] = [layer(1, 2, 2, 1)]
        let active = 0
        let nextId = 2
        let nextValue = 2
        const freshValue = () => {
          nextValue = (nextValue % 250) + 1
          return nextValue
        }
        type Model = { values: number[]; ids: number[]; active: number }
        const model = (): Model => ({
          values: live.map((entry) => valueOf(entry.bitmap)),
          ids: live.map((entry) => entry.id),
          active,
        })
        const past: Model[] = []
        let future: Model[] = []
        const recordModel = () => {
          past.push(model())
          future = []
        }
        const adopt = (snapshot: DocSnapshot) => {
          live = [...snapshot.layers]
          active = snapshot.active
        }
        const expectModel = (snapshot: DocSnapshot, expected: Model) => {
          expect(snapshot.layers.map((entry) => valueOf(entry.bitmap))).toEqual(expected.values)
          expect(snapshot.layers.map((entry) => entry.id)).toEqual(expected.ids)
          expect(snapshot.active).toBe(expected.active)
        }

        for (let step = 0; step < 200; step += 1) {
          switch (pick(9)) {
            case 0: {
              // An in-place edit: fill, clear, a stroke.
              recordModel()
              history.record(live, active)
              paint(live[active].bitmap, freshValue())
              break
            }
            case 1: {
              // A pending shape or floating selection: the live surface is replaced by a new result.
              const base = live[active].bitmap.clone()
              recordModel()
              history.record(live, active, base)
              const result = base.clone()
              paint(result, freshValue())
              live = live.map((entry, index) => (index === active ? { ...entry, bitmap: result } : entry))
              break
            }
            case 2: {
              // A whole-image operation; sometimes the transform hands a layer back unchanged.
              recordModel()
              const value = freshValue()
              live = history.transformStack(live, active, (bitmap) => {
                if (random() < 0.3) return bitmap
                const copy = bitmap.clone()
                paint(copy, value)
                return copy
              })
              break
            }
            case 3: {
              // Add a layer above the active one.
              recordModel()
              history.record(live, active)
              const next = [...live]
              next.splice(active + 1, 0, layer(nextId, 2, 2, freshValue()))
              nextId += 1
              active += 1
              live = history.isolate(next, active)
              break
            }
            case 4: {
              // Delete a layer or move one.
              if (live.length < 2) break
              recordModel()
              history.record(live, active)
              const index = pick(live.length)
              const next = live.filter((_, i) => i !== index)
              active = Math.min(index < active ? active - 1 : active, next.length - 1)
              live = history.isolate(next, active)
              break
            }
            case 5: {
              // Select another layer: no step is recorded.
              active = pick(live.length)
              live = history.isolate(live, active)
              break
            }
            case 6:
            case 7: {
              const snapshot = history.undo(live, active)
              expect(snapshot === undefined).toBe(past.length === 0)
              if (snapshot) {
                future.push(model())
                expectModel(snapshot, past.pop()!)
                adopt(snapshot)
              }
              break
            }
            case 8: {
              const snapshot = history.redo(live, active)
              expect(snapshot === undefined).toBe(future.length === 0)
              if (snapshot) {
                past.push(model())
                expectModel(snapshot, future.pop()!)
                adopt(snapshot)
              }
              break
            }
          }
          // The surface the editor paints next must belong to no retained step.
          expect(history.retains(live[active].bitmap)).toBe(false)
          // Painting it in place, as a stroke would, changes the current state only.
          paint(live[active].bitmap, freshValue())
        }

        // Walking all the way back and forth must still produce every recorded state.
        for (let snapshot = history.undo(live, active); snapshot; snapshot = history.undo(live, active)) {
          future.push(model())
          expectModel(snapshot, past.pop()!)
          adopt(snapshot)
          paint(live[active].bitmap, freshValue())
        }
        expect(past).toEqual([])
        for (let snapshot = history.redo(live, active); snapshot; snapshot = history.redo(live, active)) {
          past.push(model())
          expectModel(snapshot, future.pop()!)
          adopt(snapshot)
        }
        expect(future).toEqual([])
      }
    })
  })
})
