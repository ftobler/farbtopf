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
})
