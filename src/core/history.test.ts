import { describe, expect, it } from 'vitest'
import { History } from './history'

describe('History', () => {
  it('starts empty', () => {
    const history = new History<string>()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
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
})
