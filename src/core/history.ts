export interface HistoryOptions<T> {
  /** Retain at most this many estimated bytes of history, undo and redo states together. Requires `sizeOf`. */
  maxBytes?: number
  /** Estimated bytes held by a single state. Required for the byte budget. Called once per stored state. */
  sizeOf?: (state: T) => number
}

interface Entry<T> {
  state: T
  bytes: number
}

/**
 * A bounded undo/redo stack. States are pushed *before* a mutation, so
 * `undo(current)` returns the previous state and stashes `current` for redo.
 *
 * The byte budget covers the undo and the redo stack together: undoing turns an
 * undo step into a redo state of possibly different size, so bounding only the
 * undo side would let the redo side grow unchecked. Over budget, the oldest undo
 * steps go first, then the farthest redo states; the nearest undo step and the
 * nearest redo state are always kept.
 */
export class History<T> {
  private past: Entry<T>[] = []
  private future: Entry<T>[] = []
  private total = 0
  private readonly limit: number
  private readonly maxBytes?: number
  private readonly sizeOf?: (state: T) => number

  constructor(limit = 60, options: HistoryOptions<T> = {}) {
    this.limit = Math.max(1, limit)
    this.maxBytes = options.maxBytes
    this.sizeOf = options.sizeOf
  }

  /** Estimated bytes held by the retained undo and redo states. */
  get bytes(): number {
    return this.total
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

  /** The state the next `undo` returns, left in place. */
  peekUndo(): T | undefined {
    return this.past.at(-1)?.state
  }

  /** The state the next `redo` returns, left in place. */
  peekRedo(): T | undefined {
    return this.future.at(-1)?.state
  }

  /** Whether any retained undo or redo state satisfies `predicate`. */
  some(predicate: (state: T) => boolean): boolean {
    return this.past.some((entry) => predicate(entry.state)) || this.future.some((entry) => predicate(entry.state))
  }

  record(state: T): void {
    this.dropAll(this.future)
    this.push(this.past, state)
    if (this.past.length > this.limit) this.drop(this.past)
    this.enforceBudget()
  }

  undo(current: T): T | undefined {
    const previous = this.pop(this.past)
    if (previous === undefined) return undefined
    this.push(this.future, current)
    this.enforceBudget()
    return previous
  }

  redo(current: T): T | undefined {
    const next = this.pop(this.future)
    if (next === undefined) return undefined
    this.push(this.past, current)
    this.enforceBudget()
    return next
  }

  clear(): void {
    this.past.length = 0
    this.future.length = 0
    this.total = 0
  }

  private push(stack: Entry<T>[], state: T): void {
    const bytes = this.sizeOf ? this.sizeOf(state) : 0
    stack.push({ state, bytes })
    this.total += bytes
  }

  private pop(stack: Entry<T>[]): T | undefined {
    const entry = stack.pop()
    if (!entry) return undefined
    this.total -= entry.bytes
    return entry.state
  }

  /** Drops the bottom entry of `stack`: the oldest undo step or the farthest redo state. */
  private drop(stack: Entry<T>[]): void {
    const entry = stack.shift()
    if (entry) this.total -= entry.bytes
  }

  private dropAll(stack: Entry<T>[]): void {
    for (const entry of stack) this.total -= entry.bytes
    stack.length = 0
  }

  private enforceBudget(): void {
    if (this.maxBytes === undefined || !this.sizeOf) return
    while (this.total > this.maxBytes) {
      if (this.past.length > 1) this.drop(this.past)
      else if (this.future.length > 1) this.drop(this.future)
      else break
    }
  }
}
