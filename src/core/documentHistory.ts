import type { Bitmap } from './bitmap'
import { History } from './history'
import type { Layer } from './layers'

/** Most undo steps the editor keeps. */
export const HISTORY_LIMIT = 80
/** Most estimated bytes the editor's undo and redo states may hold together. */
export const HISTORY_MAX_BYTES = 256 * 1024 * 1024

/** An undo step: the whole layer stack and which layer was active. */
export interface DocSnapshot {
  readonly layers: readonly Layer[]
  readonly active: number
  /** Estimated bytes only this step holds; when absent, the active layer's bitmap. */
  readonly bytes?: number
}

export interface SnapshotSize {
  layers: readonly Layer[]
  active: number
  bytes?: number
}

const bitmapBytes = (bitmap: Bitmap) => bitmap.width * bitmap.height * 4

/**
 * Estimated bytes a history snapshot adds: normally only the active layer is
 * copied per step, the other layer objects are shared with the live stack. A
 * snapshot that holds more than that carries its cost in `bytes`.
 */
export function snapshotBytes(snapshot: SnapshotSize): number {
  if (snapshot.bytes !== undefined) return snapshot.bytes
  const active = snapshot.layers[snapshot.active]
  return active ? bitmapBytes(active.bitmap) : 0
}

/** Estimated bytes held by every distinct bitmap of `layers`, for a step that retains them all. */
export function stackBytes(layers: readonly Layer[]): number {
  return distinctBytes(layers, new Set())
}

/** Bytes of the distinct bitmaps of `layers` that are not in `exclude`. */
function distinctBytes(layers: readonly Layer[], exclude: ReadonlySet<Bitmap>): number {
  const seen = new Set<Bitmap>()
  let total = 0
  for (const { bitmap } of layers) {
    if (exclude.has(bitmap) || seen.has(bitmap)) continue
    seen.add(bitmap)
    total += bitmapBytes(bitmap)
  }
  return total
}

export interface DocumentHistoryOptions {
  limit?: number
  maxBytes?: number
}

/**
 * What an undo step of the document is: a memento of the layer stack.
 *
 * To keep memory down a step copies only the active layer; the other layers are
 * shared by reference with the live stack and with other steps. That is safe
 * because the editor only ever paints the *live surface* (the active layer's
 * bitmap) in place. This class guarantees the one invariant that makes it so:
 *
 *   The live surface is never referenced by a retained undo or redo state.
 *
 * It holds as long as the live surface only ever comes from this class (the stack
 * returned by `undo`, `redo`, `isolate` and `transformStack`) or is a bitmap the
 * caller created afresh after its last `record`:
 * - `record` copies the live surface instead of retaining it.
 * - Every stack handed out has its active bitmap copied if a retained state still
 *   references it, e.g. a layer that becomes active while an earlier step shares it.
 *   Only then is a copy made, so a step still costs a single layer.
 */
export class DocumentHistory {
  private readonly history: History<DocSnapshot>

  constructor({ limit = HISTORY_LIMIT, maxBytes = HISTORY_MAX_BYTES }: DocumentHistoryOptions = {}) {
    this.history = new History<DocSnapshot>(limit, { maxBytes, sizeOf: snapshotBytes })
  }

  get canUndo(): boolean {
    return this.history.canUndo
  }

  get canRedo(): boolean {
    return this.history.canRedo
  }

  /** Number of undo steps. */
  get depth(): number {
    return this.history.depth
  }

  /** Estimated bytes held by the undo and redo states. */
  get bytes(): number {
    return this.history.bytes
  }

  /**
   * Records a step that changes the active layer. `current` is the live stack, with
   * the live surface at `active`. `before` is that layer's bitmap as it was before
   * the change; leave it out (or pass the live surface) when the change is about to
   * be painted onto the live surface, and it is copied now.
   */
  record(current: readonly Layer[], active: number, before?: Bitmap): void {
    const live = current[active].bitmap
    const kept = before === undefined || before === live ? live.clone() : before
    const layers = current.map((layer, index) => (index === active ? { ...layer, bitmap: kept } : { ...layer }))
    this.history.record({ layers, active, bytes: bitmapBytes(kept) })
  }

  /**
   * Records `layers` as they are as one step that holds every layer, for a change
   * that replaces every bitmap of the stack. The caller must then replace them all,
   * live surface included; `transformStack` does both.
   */
  recordStack(layers: readonly Layer[], active: number): void {
    this.history.record({ layers: layers.map((layer) => ({ ...layer })), active, bytes: stackBytes(layers) })
  }

  /** Records `current` as one whole-stack step and returns the stack with every layer transformed. */
  transformStack(
    current: readonly Layer[],
    active: number,
    transform: (bitmap: Bitmap, bottom: boolean) => Bitmap,
  ): Layer[] {
    this.recordStack(current, active)
    const next = current.map((layer, index) => ({ ...layer, bitmap: transform(layer.bitmap, index === 0) }))
    return this.isolate(next, active)
  }

  /** Steps back from the live stack `current`; the returned stack becomes the live one. */
  undo(current: readonly Layer[], active: number): DocSnapshot | undefined {
    const previous = this.history.peekUndo()
    if (!previous) return undefined
    this.history.undo(this.swapState(current, active, previous))
    return this.handOut(previous)
  }

  /** Steps forward from the live stack `current`; the returned stack becomes the live one. */
  redo(current: readonly Layer[], active: number): DocSnapshot | undefined {
    const next = this.history.peekRedo()
    if (!next) return undefined
    this.history.redo(this.swapState(current, active, next))
    return this.handOut(next)
  }

  /**
   * Returns `layers` ready to become the live stack with `active` as the live
   * surface: that layer's bitmap is copied when a retained state references it.
   */
  isolate(layers: readonly Layer[], active: number): Layer[] {
    const next = [...layers]
    const bitmap = next[active]?.bitmap
    if (bitmap && this.retains(bitmap)) next[active] = { ...next[active], bitmap: bitmap.clone() }
    return next
  }

  /** Whether any retained undo or redo state references `bitmap`. */
  retains(bitmap: Bitmap): boolean {
    return this.history.some((snapshot) => snapshot.layers.some((layer) => layer.bitmap === bitmap))
  }

  /** Forgets every step, for a new document. */
  reset(): void {
    this.history.clear()
  }

  /** The live stack as a state to keep while `restored` replaces it, costed by what only it holds. */
  private swapState(current: readonly Layer[], active: number, restored: DocSnapshot): DocSnapshot {
    const kept = new Set(restored.layers.map((layer) => layer.bitmap))
    return { layers: current.map((layer) => ({ ...layer })), active, bytes: distinctBytes(current, kept) }
  }

  private handOut(snapshot: DocSnapshot): DocSnapshot {
    return { layers: this.isolate(snapshot.layers, snapshot.active), active: snapshot.active }
  }
}
