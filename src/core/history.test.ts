import { describe, expect, it } from 'vitest'
import { History } from './history'

/**
 * The generic bounded undo/redo stack: stack order, the step limit and the byte
 * budget with its eviction order. What an undo step of the document holds is
 * covered in documentHistory.test.ts, not here.
 */
describe('History', () => {
  it('starts empty', () => {
    const history = new History<string>()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
    expect(history.depth).toBe(0)
    expect(history.bytes).toBe(0)
  })

  it('undoes back to the initial state', () => {
    const history = new History<string>()
    history.record('a')
    expect(history.undo('b')).toBe('a')
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
  })

  it('redoes a state', () => {
    const history = new History<string>()
    history.record('a')
    history.undo('b')
    expect(history.redo('a')).toBe('b')
    expect(history.canRedo).toBe(false)
  })

  it('drops the redo stack after a new record', () => {
    const history = new History<string>()
    history.record('a')
    history.undo('b')
    history.record('c')
    expect(history.canRedo).toBe(false)
  })

  it('returns undefined when nothing to undo or redo', () => {
    const history = new History<string>()
    expect(history.undo('a')).toBeUndefined()
    expect(history.redo('a')).toBeUndefined()
  })

  it('keeps neither the current state nor its bytes when there is nothing to undo', () => {
    const history = new History<number>(10, { sizeOf: (state) => state })
    history.record(10)
    history.undo(5)
    expect(history.undo(7)).toBeUndefined()
    expect(history.bytes).toBe(5)
    expect(history.some((state) => state === 7)).toBe(false)
    expect(history.peekRedo()).toBe(5)
  })

  it('keeps neither the current state nor its bytes when there is nothing to redo', () => {
    const history = new History<number>(10, { sizeOf: (state) => state })
    history.record(10)
    expect(history.redo(7)).toBeUndefined()
    expect(history.bytes).toBe(10)
    expect(history.some((state) => state === 7)).toBe(false)
    expect(history.depth).toBe(1)
  })

  it('forgets every redo state on a new record', () => {
    const history = new History<string>()
    history.record('a')
    history.record('b')
    history.undo('c')
    history.undo('d')
    history.record('e')
    expect(history.peekRedo()).toBeUndefined()
    expect(history.some((state) => state === 'c' || state === 'd')).toBe(false)
    expect(history.peekUndo()).toBe('e')
  })

  it('keeps only the latest step with a limit of one', () => {
    const history = new History<number>(1)
    history.record(1)
    history.record(2)
    expect(history.depth).toBe(1)
    expect(history.undo(3)).toBe(2)
    expect(history.canUndo).toBe(false)
  })

  it.each([0, -5])('treats a limit of %i as a limit of one', (limit) => {
    const history = new History<number>(limit)
    history.record(1)
    expect(history.canUndo).toBe(true)
    history.record(2)
    expect(history.depth).toBe(1)
    expect(history.undo(3)).toBe(2)
  })

  it('evicts the oldest step past the limit even when it was redone', () => {
    const history = new History<number>(2, { sizeOf: (state) => state })
    history.record(1)
    history.record(2)
    history.undo(30)
    history.redo(2)
    history.record(40)
    // The limit drops step 1; its bytes go with it.
    expect(history.depth).toBe(2)
    expect(history.bytes).toBe(2 + 40)
    expect(history.some((state) => state === 1)).toBe(false)
  })

  it('honours the limit', () => {
    const history = new History<number>(2)
    history.record(1)
    history.record(2)
    history.record(3)
    expect(history.depth).toBe(2)
    expect(history.undo(4)).toBe(3)
    expect(history.undo(3)).toBe(2)
    expect(history.canUndo).toBe(false)
  })

  it('clears both stacks', () => {
    const history = new History<string>()
    history.record('a')
    history.undo('b')
    history.clear()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })

  it('evicts the oldest entries when the byte budget is exceeded', () => {
    const history = new History<number>(10, { maxBytes: 25, sizeOf: () => 10 })
    history.record(1)
    history.record(2)
    history.record(3)
    expect(history.depth).toBe(2)
    expect(history.bytes).toBe(20)
    expect(history.canUndo).toBe(true)
    expect(history.undo(4)).toBe(3)
    expect(history.undo(3)).toBe(2)
    expect(history.canUndo).toBe(false)
  })

  it('still applies the step-count limit alongside the byte budget', () => {
    const history = new History<number>(2, { maxBytes: 1000, sizeOf: () => 10 })
    history.record(1)
    history.record(2)
    history.record(3)
    expect(history.depth).toBe(2)
    expect(history.undo(4)).toBe(3)
    expect(history.undo(3)).toBe(2)
    expect(history.canUndo).toBe(false)
  })

  it('keeps a single state that is larger than the byte budget', () => {
    const history = new History<number>(10, { maxBytes: 5, sizeOf: () => 10 })
    history.record(1)
    expect(history.depth).toBe(1)
    expect(history.canUndo).toBe(true)
    history.record(2)
    expect(history.depth).toBe(1)
    expect(history.undo(3)).toBe(2)
  })

  it('does not apply a byte budget without a sizeOf', () => {
    const history = new History<number>(2, { maxBytes: 5 })
    history.record(1)
    history.record(2)
    history.record(3)
    expect(history.depth).toBe(2)
    expect(history.bytes).toBe(0)
  })

  it('does not evict by bytes without a budget', () => {
    const history = new History<number>(10, { sizeOf: () => 10 })
    history.record(1)
    history.record(2)
    history.record(3)
    expect(history.depth).toBe(3)
  })

  it('behaves as before with the single-argument constructor', () => {
    const history = new History<number>(2)
    history.record(1)
    history.record(2)
    history.record(3)
    expect(history.depth).toBe(2)
    expect(history.bytes).toBe(0)
    expect(history.undo(4)).toBe(3)
  })

  it('peeks at the next undo and redo states without moving', () => {
    const history = new History<string>()
    expect(history.peekUndo()).toBeUndefined()
    expect(history.peekRedo()).toBeUndefined()
    history.record('a')
    history.record('b')
    expect(history.peekUndo()).toBe('b')
    expect(history.depth).toBe(2)
    history.undo('c')
    expect(history.peekUndo()).toBe('a')
    expect(history.peekRedo()).toBe('c')
    expect(history.canRedo).toBe(true)
  })

  it('tells whether any retained state matches', () => {
    const history = new History<string>()
    history.record('a')
    history.record('b')
    history.undo('c')
    expect(history.some((state) => state === 'a')).toBe(true)
    expect(history.some((state) => state === 'c')).toBe(true)
    // 'b' was handed back by undo, so it is no longer retained.
    expect(history.some((state) => state === 'b')).toBe(false)
  })

  it('counts the redo stack towards the retained bytes', () => {
    const history = new History<number>(10, { sizeOf: (state) => state })
    history.record(10)
    history.record(20)
    expect(history.bytes).toBe(30)
    expect(history.undo(5)).toBe(20)
    expect(history.bytes).toBe(15)
    expect(history.redo(7)).toBe(5)
    expect(history.bytes).toBe(17)
    history.record(1)
    // A new record drops the redo stack and its bytes.
    expect(history.bytes).toBe(18)
  })

  it('resets the retained bytes when cleared', () => {
    const history = new History<number>(10, { sizeOf: () => 10 })
    history.record(1)
    history.undo(2)
    history.clear()
    expect(history.bytes).toBe(0)
  })

  it('sizes every state once, however long the history', () => {
    let calls = 0
    const history = new History<number>(1000, {
      maxBytes: 500 * 10,
      sizeOf: () => {
        calls += 1
        return 10
      },
    })
    for (let i = 0; i < 2000; i += 1) history.record(i)
    expect(history.depth).toBe(500)
    expect(history.bytes).toBe(5000)
    expect(calls).toBe(2000)
  })

  it('bounds undo and redo stacks together by the byte budget', () => {
    const history = new History<number>(10, { maxBytes: 40, sizeOf: (state) => state })
    history.record(10)
    history.record(10)
    history.record(10)
    expect(history.bytes).toBe(30)
    // Undoing swaps a 10-byte step for a 25-byte redo state: the oldest undo step goes.
    expect(history.undo(25)).toBe(10)
    expect(history.depth).toBe(1)
    expect(history.bytes).toBe(35)
    expect(history.canRedo).toBe(true)
  })

  it('evicts the farthest redo state once only the nearest undo step is left', () => {
    const history = new History<number>(10, { maxBytes: 30, sizeOf: (state) => state })
    history.record(10)
    history.record(10)
    history.record(10)
    history.undo(10)
    history.undo(10)
    history.undo(10)
    expect(history.bytes).toBe(30)
    expect(history.redo(15)).toBe(10)
    expect(history.depth).toBe(1)
    expect(history.bytes).toBe(25)
    expect(history.redo(10)).toBe(10)
    expect(history.canRedo).toBe(false)
  })

  it('keeps the nearest undo and redo steps even over the byte budget', () => {
    const history = new History<number>(10, { maxBytes: 5, sizeOf: () => 10 })
    history.record(1)
    expect(history.undo(2)).toBe(1)
    history.redo(3)
    expect(history.undo(4)).toBe(3)
    expect(history.canRedo).toBe(true)
    expect(history.canUndo).toBe(false)
  })
})
