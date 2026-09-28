/**
 * A bounded undo/redo stack. States are pushed *before* a mutation, so
 * `undo(current)` returns the previous state and stashes `current` for redo.
 */
export class History<T> {
  private past: T[] = []
  private future: T[] = []
  private readonly limit: number

  constructor(limit = 60) {
    this.limit = Math.max(1, limit)
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  get depth(): number {
    return this.past.length
  }

  record(state: T): void {
    this.past.push(state)
    if (this.past.length > this.limit) this.past.shift()
    this.future.length = 0
  }

  undo(current: T): T | undefined {
    const previous = this.past.pop()
    if (previous === undefined) return undefined
    this.future.push(current)
    return previous
  }

  redo(current: T): T | undefined {
    const next = this.future.pop()
    if (next === undefined) return undefined
    this.past.push(current)
    return next
  }

  clear(): void {
    this.past.length = 0
    this.future.length = 0
  }
}
