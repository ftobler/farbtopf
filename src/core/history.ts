export interface HistoryOptions<T> {
  /** Retain at most this many estimated bytes of history. Requires `sizeOf`. */
  maxBytes?: number
  /** Estimated bytes held by a single state. Required for the byte budget. */
  sizeOf?: (state: T) => number
}

/**
 * A bounded undo/redo stack. States are pushed *before* a mutation, so
 * `undo(current)` returns the previous state and stashes `current` for redo.
 */
export class History<T> {
  private past: T[] = []
  private future: T[] = []
  private readonly limit: number
  private readonly maxBytes?: number
  private readonly sizeOf?: (state: T) => number

  constructor(limit = 60, options: HistoryOptions<T> = {}) {
    this.limit = Math.max(1, limit)
    this.maxBytes = options.maxBytes
    this.sizeOf = options.sizeOf
  }

  /** Estimated bytes held by the retained undo steps. */
  get bytes(): number {
    if (!this.sizeOf) return 0
    return this.past.reduce((total, state) => total + this.sizeOf!(state), 0)
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
    if (this.maxBytes !== undefined && this.sizeOf) {
      while (this.past.length > 1 && this.bytes > this.maxBytes) this.past.shift()
    }
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
