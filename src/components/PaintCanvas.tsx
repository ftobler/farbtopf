import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Bitmap } from '../core/bitmap'
import {
  HIGHLIGHTER_ALPHA,
  compositeHighlighter,
  createCoverageMask,
  paintBrushStroke,
  stampHighlighter,
} from '../core/brushes'
import type { BrushId, CoverageMask } from '../core/brushes'
import type { Rgba } from '../core/color'
import { WHITE, colorsEqual, toCss } from '../core/color'
import type { Point, Rect } from '../core/geometry'
import { clamp, clampPoint, distance, normalizeRect, pointInRect, pointsEqual } from '../core/geometry'
import { History } from '../core/history'
import {
  blitAlpha,
  crop,
  drawLine,
  extractRegion,
  flipHorizontal,
  flipVertical,
  floodFill,
  rotateBy,
  scale,
  stamp,
} from '../core/raster'
import type { BrushShape } from '../core/raster'
import { applyMask, fillSelection, invertSelection, isSelected, polygonSelection } from '../core/selection'
import type { SelectionMask, SelectionShape } from '../core/selection'
import { renderShape as drawShape, shapeById } from '../core/shapes'
import type { ShapeKind } from '../core/shapes'
import type { ShapeFill, ToolId } from '../core/tools'
import { isShapeTool, strokeColorFor, strokeWidthFor } from '../core/tools'
import { bitmapFromDataUrl } from '../render/image'
import { DEFAULT_TEXT_OPTIONS, renderText } from '../render/text'
import type { TextOptions } from '../render/text'

export interface PaintCanvasHandle {
  newDocument: (width: number, height: number) => void
  loadBitmap: (bitmap: Bitmap) => void
  loadDataUrl: (src: string) => Promise<void>
  clear: () => void
  undo: () => void
  redo: () => void
  toDataUrl: () => string
  getSize: () => { width: number; height: number }
  /** Mirrors the selection, or the whole image when nothing is selected. */
  flip: (axis: 'horizontal' | 'vertical') => void
  /**
   * Rotates the selection clockwise about its centre, or the whole image when nothing
   * is selected; the canvas then grows to fit and new corners take the secondary colour.
   */
  rotate: (degrees: number) => void
  resize: (width: number, height: number) => void
  cropToSelection: () => void
  getSelection: () => Rect | null
  clearSelection: () => void
  selectAll: () => void
  invertSelection: () => void
  deleteSelection: () => void
  getSelectionDataUrl: () => string | null
  cutSelection: () => void
}

export interface PaintCanvasProps {
  initialWidth: number
  initialHeight: number
  tool: ToolId
  primary: Rgba
  secondary: Rgba
  brushSize: number
  shapeFill: ShapeFill
  shapeKind?: ShapeKind
  zoom: number
  pan?: { x: number; y: number }
  showGrid: boolean
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void
  onCursorMove: (point: Point | null) => void
  onPickColor: (color: Rgba, slot: 'primary' | 'secondary') => void
  onSizeChange: (width: number, height: number) => void
  onSelectionChange?: (hasSelection: boolean) => void
  /** Zoom tool click: 1 to zoom in (left button), -1 to zoom out (right button). */
  onZoomClick?: (direction: 1 | -1) => void
  transparentSelection: boolean
  selectionShape?: SelectionShape
  /** Freehand brush style used by the brush tool. */
  brush?: BrushId
  /** Font, size and style used by the text tool. */
  text?: TextOptions
  /** Shows a small overview of the whole image in the corner of the workspace. */
  showMiniature?: boolean
  /** Called when the miniature view is dragged to move the visible area. */
  onPanChange?: (pan: Point) => void
}

interface StrokeState {
  pointerId: number
  slot: 'primary' | 'secondary'
  tool: ToolId
  kind: ShapeKind
  start: Point
  last: Point
  base: Bitmap
  recorded: boolean
  /** Every pointer position of a freehand shape. */
  points: Point[]
  /** Stroke-scoped coverage for the highlighter so overlaps stay one flat alpha. */
  highlighter?: CoverageMask
}

/**
 * A polyline being built click by click. The document stays untouched until it is
 * finished; only then is it drawn onto `base` and recorded as a single history entry.
 */
interface PolylineState {
  kind: ShapeKind
  slot: 'primary' | 'secondary'
  base: Bitmap
  points: Point[]
  /** The loose end that follows the pointer while dragging or hovering. */
  pending: Point | null
  /** The pointer held down to place the next vertex, if any. */
  pointerId: number | null
  lastDown: { time: number; point: Point }
}

interface TextEditorState {
  x: number
  y: number
  value: string
  slot: 'primary' | 'secondary'
}

type SelectionHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface FloatingSelection {
  source: Bitmap
  bitmap: Bitmap
  x: number
  y: number
  base: Bitmap
}

interface RotationStart {
  bitmap: Bitmap
  shape: Bitmap
  center: Point
}

interface SelectDrag {
  pointerId: number
  mode: 'marquee' | 'lasso' | 'move' | 'resize' | 'rotate'
  start: Point
  points?: Point[]
  handle?: SelectionHandle
  origin?: Rect
  rotation?: RotationStart
}

const HISTORY_LIMIT = 80

const SELECTION_HANDLES: SelectionHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_HIT = 4
const DOUBLE_CLICK_MS = 300
/** How far apart, in screen pixels, the two presses of a double-click may be. */
const DOUBLE_CLICK_SLOP = 4

/** The points handed to `renderShape`: the dragged box, or the whole freehand trail. */
function shapePoints(stroke: StrokeState, end: Point): Point[] {
  return shapeById(stroke.kind).interaction === 'freehand' ? stroke.points : [stroke.start, end]
}

function strokeShape(tool: ToolId): BrushShape {
  return tool === 'pencil' || tool === 'eraser' ? 'square' : 'round'
}

function spray(bitmap: Bitmap, center: Point, radius: number, color: Rgba): void {
  const r = Math.max(1, radius)
  const attempts = Math.max(8, Math.round(r * r * 0.6))
  for (let i = 0; i < attempts; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const distance = Math.sqrt(Math.random()) * r
    bitmap.set(
      Math.round(center.x + Math.cos(angle) * distance),
      Math.round(center.y + Math.sin(angle) * distance),
      color,
    )
  }
}

function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(rect.x, width - 1))
  const y = Math.max(0, Math.min(rect.y, height - 1))
  return {
    x,
    y,
    width: Math.min(Math.max(1, rect.width), width - x),
    height: Math.min(Math.max(1, rect.height), height - y),
  }
}

function handlePoint(rect: Rect, handle: SelectionHandle): Point {
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  const midX = rect.x + rect.width / 2
  const midY = rect.y + rect.height / 2
  switch (handle) {
    case 'nw': return { x: left, y: top }
    case 'n': return { x: midX, y: top }
    case 'ne': return { x: right, y: top }
    case 'e': return { x: right, y: midY }
    case 'se': return { x: right, y: bottom }
    case 's': return { x: midX, y: bottom }
    case 'sw': return { x: left, y: bottom }
    case 'w': return { x: left, y: midY }
  }
}

function hitHandle(rect: Rect, point: Point, tolerance: number): SelectionHandle | null {
  let best: SelectionHandle | null = null
  let bestDistance = Infinity
  for (const handle of SELECTION_HANDLES) {
    const candidate = distance(point, handlePoint(rect, handle))
    if (candidate < bestDistance) {
      bestDistance = candidate
      best = handle
    }
  }
  return bestDistance <= tolerance ? best : null
}

function handleCursor(handle: SelectionHandle): string {
  if (handle === 'n' || handle === 's') return 'ns-resize'
  if (handle === 'e' || handle === 'w') return 'ew-resize'
  if (handle === 'nw' || handle === 'se') return 'nwse-resize'
  return 'nesw-resize'
}

function resizeRect(origin: Rect, handle: SelectionHandle, point: Point, width: number, height: number): Rect {
  let left = origin.x
  let top = origin.y
  let right = origin.x + origin.width
  let bottom = origin.y + origin.height
  if (handle.includes('w')) left = clamp(Math.round(point.x), 0, width - 1)
  if (handle.includes('e')) right = clamp(Math.round(point.x), 1, width)
  if (handle.includes('n')) top = clamp(Math.round(point.y), 0, height - 1)
  if (handle.includes('s')) bottom = clamp(Math.round(point.y), 1, height)
  if (right <= left) {
    if (handle.includes('w')) left = right - 1
    else right = left + 1
  }
  if (bottom <= top) {
    if (handle.includes('n')) top = bottom - 1
    else bottom = top + 1
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** An opaque bitmap of the selected pixels, used to rotate a selection's shape. */
function shapeBitmap(width: number, height: number, mask: SelectionMask | null): Bitmap {
  const shape = new Bitmap(width, height)
  const local = { x: 0, y: 0, width, height }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isSelected(local, mask, x, y)) shape.set(x, y, WHITE)
    }
  }
  return shape
}

function maskFromShape(shape: Bitmap): SelectionMask | null {
  const data = new Uint8Array(shape.width * shape.height)
  let full = true
  for (let i = 0; i < data.length; i += 1) {
    data[i] = shape.data[i * 4 + 3] >= 128 ? 1 : 0
    if (!data[i]) full = false
  }
  return full ? null : { width: shape.width, height: shape.height, data }
}

function flipMask(mask: SelectionMask, axis: 'horizontal' | 'vertical'): SelectionMask {
  const { width, height } = mask
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = axis === 'horizontal' ? width - 1 - x : x
      const sy = axis === 'vertical' ? height - 1 - y : y
      data[y * width + x] = mask.data[sy * width + sx]
    }
  }
  return { width, height, data }
}

function pointerAngle(center: Point, point: Point): number {
  return Math.atan2(point.y - center.y, point.x - center.x)
}

function MaskOutline({ mask }: { mask: SelectionMask }) {
  const outlineRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = outlineRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const { width, height, data } = mask
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] === 1
    const outline = new Bitmap(width, height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!at(x, y)) continue
        if (at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1)) continue
        outline.set(x, y, (x + y) % 4 < 2 ? { r: 0, g: 0, b: 0, a: 220 } : { r: 255, g: 255, b: 255, a: 220 })
      }
    }
    context.putImageData(outline.toImageData(), 0, 0)
  }, [mask])

  return <canvas ref={outlineRef} className="selection-mask" width={mask.width} height={mask.height} />
}

function bitmapToDataUrl(bitmap: Bitmap): string {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.putImageData(bitmap.toImageData(), 0, 0)
  return canvas.toDataURL('image/png')
}

export const PaintCanvas = forwardRef<PaintCanvasHandle, PaintCanvasProps>(function PaintCanvas(
  {
    initialWidth,
    initialHeight,
    tool,
    primary,
    secondary,
    brushSize,
    shapeFill,
    shapeKind = 'rectangle',
    zoom,
    pan = { x: 0, y: 0 },
    showGrid,
    onHistoryChange,
    onCursorMove,
    onPickColor,
    onSizeChange,
    onSelectionChange = () => {},
    onZoomClick = () => {},
    transparentSelection,
    selectionShape = 'rectangle',
    brush = 'round',
    text = DEFAULT_TEXT_OPTIONS,
    showMiniature = false,
    onPanChange,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const miniatureRef = useRef<HTMLCanvasElement | null>(null)
  const bitmapRef = useRef<Bitmap | null>(null)
  const historyRef = useRef(new History<Bitmap>(HISTORY_LIMIT))
  const strokeRef = useRef<StrokeState | null>(null)
  const editorRef = useRef<TextEditorState | null>(null)
  const selectionRef = useRef<Rect | null>(null)
  const maskRef = useRef<SelectionMask | null>(null)
  const selectRef = useRef<SelectDrag | null>(null)
  const floatingRef = useRef<FloatingSelection | null>(null)
  const polylineRef = useRef<PolylineState | null>(null)
  const [polylineActive, setPolylineActive] = useState(false)
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight })
  const [editor, setEditor] = useState<TextEditorState | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const [mask, setMask] = useState<SelectionMask | null>(null)
  const [lasso, setLasso] = useState<Point[] | null>(null)
  const [hoverCursor, setHoverCursor] = useState<string | null>(null)
  const [viewport, setViewport] = useState<Rect | null>(null)

  const doc = useCallback((): Bitmap => {
    if (!bitmapRef.current) {
      bitmapRef.current = new Bitmap(initialWidth, initialHeight, WHITE)
    }
    return bitmapRef.current
  }, [initialWidth, initialHeight])

  const paint = useCallback((bitmap: Bitmap) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    // Scale the backing store with the device pixel ratio so strokes stay crisp
    // on high-density displays; the CSS size (and therefore the shown zoom)
    // is untouched.
    const ratio = window.devicePixelRatio || 1
    const backingWidth = Math.max(1, Math.round(bitmap.width * ratio))
    const backingHeight = Math.max(1, Math.round(bitmap.height * ratio))
    if (canvas.width !== backingWidth) canvas.width = backingWidth
    if (canvas.height !== backingHeight) canvas.height = backingHeight

    const image = bitmap.toImageData()

    const miniature = miniatureRef.current
    if (miniature) {
      if (miniature.width !== bitmap.width) miniature.width = bitmap.width
      if (miniature.height !== bitmap.height) miniature.height = bitmap.height
      miniature.getContext('2d')?.putImageData(image, 0, 0)
    }

    if (ratio === 1 || typeof context.drawImage !== 'function') {
      context.putImageData(image, 0, 0)
      return
    }

    let offscreen = offscreenRef.current
    if (!offscreen) {
      offscreen = document.createElement('canvas')
      offscreenRef.current = offscreen
    }
    if (offscreen.width !== bitmap.width) offscreen.width = bitmap.width
    if (offscreen.height !== bitmap.height) offscreen.height = bitmap.height
    const offscreenContext = offscreen.getContext('2d')
    if (!offscreenContext) {
      context.putImageData(image, 0, 0)
      return
    }
    offscreenContext.putImageData(image, 0, 0)
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, backingWidth, backingHeight)
    context.drawImage(offscreen, 0, 0, backingWidth, backingHeight)
  }, [])

  const syncHistory = useCallback(() => {
    const history = historyRef.current
    onHistoryChange(history.canUndo, history.canRedo)
  }, [onHistoryChange])

  const updateSelection = useCallback(
    (rect: Rect | null, nextMask: SelectionMask | null = null) => {
      selectionRef.current = rect
      maskRef.current = rect ? nextMask : null
      setSelection(rect)
      setMask(rect ? nextMask : null)
      onSelectionChange(rect !== null)
    },
    [onSelectionChange],
  )

  const currentRect = useCallback((): Rect | null => {
    const floating = floatingRef.current
    if (floating) {
      return { x: floating.x, y: floating.y, width: floating.bitmap.width, height: floating.bitmap.height }
    }
    return selectionRef.current
  }, [])

  const renderPreview = useCallback(() => {
    const floating = floatingRef.current
    if (!floating) return
    const preview = floating.base.clone()
    blitAlpha(preview, floating.bitmap, floating.x, floating.y)
    paint(preview)
  }, [paint])

  const ensureFloating = useCallback(
    (rect: Rect): FloatingSelection => {
      if (floatingRef.current) return floatingRef.current
      const original = doc()
      const base = original.clone()
      const selectionMask = maskRef.current
      const region = extractRegion(original, rect, transparentSelection ? secondary : null)
      const bitmap = selectionMask ? applyMask(region, selectionMask) : region
      historyRef.current.record(original.clone())
      fillSelection(base, rect, selectionMask, secondary)
      bitmapRef.current = base
      const floating: FloatingSelection = { source: bitmap, bitmap, x: rect.x, y: rect.y, base }
      floatingRef.current = floating
      syncHistory()
      return floating
    },
    [doc, secondary, syncHistory, transparentSelection],
  )

  const beginRotation = useCallback((): RotationStart | null => {
    const rect = currentRect()
    if (!rect) return null
    const floating = ensureFloating(rect)
    const { width, height } = floating.bitmap
    return {
      bitmap: floating.bitmap,
      shape: shapeBitmap(width, height, maskRef.current),
      center: { x: floating.x + width / 2, y: floating.y + height / 2 },
    }
  }, [currentRect, ensureFloating])

  const applyRotation = useCallback(
    (start: RotationStart, degrees: number) => {
      const floating = floatingRef.current
      if (!floating) return
      const angle = Math.round(degrees * 1e6) / 1e6
      const bitmap = rotateBy(start.bitmap, angle, null)
      floating.bitmap = bitmap
      floating.x = Math.round(start.center.x - bitmap.width / 2)
      floating.y = Math.round(start.center.y - bitmap.height / 2)
      renderPreview()
      updateSelection(
        { x: floating.x, y: floating.y, width: bitmap.width, height: bitmap.height },
        maskFromShape(rotateBy(start.shape, angle, null)),
      )
    },
    [renderPreview, updateSelection],
  )

  const commitFloating = useCallback(() => {
    const floating = floatingRef.current
    if (!floating) return
    const result = floating.base.clone()
    blitAlpha(result, floating.bitmap, floating.x, floating.y)
    bitmapRef.current = result
    floatingRef.current = null
    paint(result)
    syncHistory()
  }, [paint, syncHistory])

  useEffect(() => {
    if (tool === 'select') return
    if (floatingRef.current) commitFloating()
    if (selectionRef.current) updateSelection(null)
  }, [tool, commitFloating, updateSelection])

  useEffect(() => {
    paint(doc())
  }, [size, paint, doc])

  useEffect(() => {
    if (showMiniature) paint(doc())
  }, [showMiniature, paint, doc])

  // The part of the image currently visible in the workspace, in image pixels.
  useEffect(() => {
    if (!showMiniature) return
    const update = () => {
      const canvas = canvasRef.current
      const workspace = canvas?.closest('.workspace')
      if (!canvas || !(workspace instanceof HTMLElement)) return
      const canvasRect = canvas.getBoundingClientRect()
      const workspaceRect = workspace.getBoundingClientRect()
      if (canvasRect.width === 0 || canvasRect.height === 0) return
      const left = (workspaceRect.left - canvasRect.left) / zoom
      const top = (workspaceRect.top - canvasRect.top) / zoom
      const width = workspaceRect.width / zoom
      const height = workspaceRect.height / zoom
      const x = Math.max(0, Math.min(size.width, left))
      const y = Math.max(0, Math.min(size.height, top))
      setViewport({
        x,
        y,
        width: Math.max(0, Math.min(size.width - x, width - (x - left))),
        height: Math.max(0, Math.min(size.height - y, height - (y - top))),
      })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showMiniature, pan.x, pan.y, zoom, size.width, size.height])

  const miniatureImagePoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const miniature = miniatureRef.current
      if (!miniature) return null
      const rect = miniature.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      return {
        x: ((clientX - rect.left) / rect.width) * size.width,
        y: ((clientY - rect.top) / rect.height) * size.height,
      }
    },
    [size.width, size.height],
  )

  const centerOn = useCallback(
    (clientX: number, clientY: number) => {
      if (!onPanChange) return
      const point = miniatureImagePoint(clientX, clientY)
      if (!point) return
      onPanChange({
        x: (size.width / 2 - point.x) * zoom,
        y: (size.height / 2 - point.y) * zoom,
      })
    },
    [miniatureImagePoint, onPanChange, size.width, size.height, zoom],
  )

  const handleMiniatureDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      centerOn(event.clientX, event.clientY)
    },
    [centerOn],
  )

  const handleMiniatureMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.buttons === 0) return
      centerOn(event.clientX, event.clientY)
    },
    [centerOn],
  )

  const colorFor = useCallback(
    (slot: 'primary' | 'secondary') => (slot === 'secondary' ? secondary : primary),
    [primary, secondary],
  )

  const renderShape = useCallback(
    (target: Bitmap, kind: ShapeKind, points: readonly Point[], slot: 'primary' | 'secondary') => {
      const color = colorFor(slot)
      const fillColor = slot === 'secondary' ? primary : secondary
      drawShape(target, kind, points, {
        width: brushSize,
        stroke: shapeFill === 'filled' ? null : color,
        fill: shapeFill === 'filled' ? color : shapeFill === 'outline-filled' ? fillColor : null,
      })
    },
    [brushSize, colorFor, primary, secondary, shapeFill],
  )

  const previewPolyline = useCallback(() => {
    const polyline = polylineRef.current
    if (!polyline) return
    const points = polyline.pending ? [...polyline.points, polyline.pending] : polyline.points
    const preview = polyline.base.clone()
    if (points.length > 1) renderShape(preview, polyline.kind, points, polyline.slot)
    paint(preview)
  }, [paint, renderShape])

  /** Draws the vertices placed so far as one undo step; a lone vertex is dropped. */
  const finishPolyline = useCallback(() => {
    const polyline = polylineRef.current
    if (!polyline) return
    polylineRef.current = null
    setPolylineActive(false)
    if (polyline.points.length < 2) {
      paint(doc())
      return
    }
    historyRef.current.record(polyline.base)
    const final = polyline.base.clone()
    renderShape(final, polyline.kind, polyline.points, polyline.slot)
    bitmapRef.current = final
    paint(final)
    syncHistory()
  }, [doc, paint, renderShape, syncHistory])

  const finishPolylineRef = useRef(finishPolyline)
  useEffect(() => {
    finishPolylineRef.current = finishPolyline
  }, [finishPolyline])

  useEffect(() => {
    finishPolylineRef.current()
  }, [tool, shapeKind])

  useEffect(() => {
    if (!polylineActive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return
      // Escape keeps what has been drawn, like Enter: MS Paint has no way to take back a vertex either.
      event.preventDefault()
      finishPolylineRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [polylineActive])

  const resetDocument = useCallback(
    (bitmap: Bitmap) => {
      polylineRef.current = null
      setPolylineActive(false)
      bitmapRef.current = bitmap
      historyRef.current = new History<Bitmap>(HISTORY_LIMIT)
      editorRef.current = null
      floatingRef.current = null
      setEditor(null)
      setSize({ width: bitmap.width, height: bitmap.height })
      onSizeChange(bitmap.width, bitmap.height)
      paint(bitmap)
      updateSelection(null)
      syncHistory()
    },
    [onSizeChange, paint, syncHistory, updateSelection],
  )

  const applyBitmap = useCallback(
    (next: Bitmap) => {
      historyRef.current.record(doc().clone())
      bitmapRef.current = next
      setSize({ width: next.width, height: next.height })
      onSizeChange(next.width, next.height)
      paint(next)
      syncHistory()
    },
    [doc, onSizeChange, paint, syncHistory],
  )

  useImperativeHandle(
    ref,
    () => ({
      newDocument(width, height) {
        resetDocument(new Bitmap(width, height, WHITE))
      },
      loadBitmap(bitmap) {
        resetDocument(bitmap)
      },
      async loadDataUrl(src) {
        resetDocument(await bitmapFromDataUrl(src))
      },
      clear() {
        finishPolyline()
        commitFloating()
        const history = historyRef.current
        history.record(doc().clone())
        doc().fill(WHITE)
        paint(doc())
        syncHistory()
      },
      undo() {
        finishPolyline()
        if (floatingRef.current) {
          commitFloating()
          updateSelection(null)
        }
        const previous = historyRef.current.undo(doc())
        if (!previous) return
        bitmapRef.current = previous
        setSize({ width: previous.width, height: previous.height })
        onSizeChange(previous.width, previous.height)
        paint(previous)
        syncHistory()
      },
      redo() {
        finishPolyline()
        if (floatingRef.current) {
          commitFloating()
          updateSelection(null)
        }
        const next = historyRef.current.redo(doc())
        if (!next) return
        bitmapRef.current = next
        setSize({ width: next.width, height: next.height })
        onSizeChange(next.width, next.height)
        paint(next)
        syncHistory()
      },
      toDataUrl() {
        finishPolyline()
        const offscreen = offscreenRef.current
        if (offscreen) return offscreen.toDataURL('image/png')
        return canvasRef.current?.toDataURL('image/png') ?? ''
      },
      getSize() {
        return { width: size.width, height: size.height }
      },
      flip(axis) {
        finishPolyline()
        const mirror = axis === 'horizontal' ? flipHorizontal : flipVertical
        const rect = currentRect()
        if (rect) {
          const floating = ensureFloating(rect)
          floating.bitmap = mirror(floating.bitmap)
          floating.source = mirror(floating.source)
          renderPreview()
          const selectionMask = maskRef.current
          updateSelection(
            { x: floating.x, y: floating.y, width: floating.bitmap.width, height: floating.bitmap.height },
            selectionMask ? flipMask(selectionMask, axis) : null,
          )
          return
        }
        applyBitmap(mirror(doc()))
      },
      rotate(degrees) {
        finishPolyline()
        const start = beginRotation()
        if (start) {
          applyRotation(start, degrees)
          const floating = floatingRef.current
          if (floating) floating.source = floating.bitmap
          return
        }
        applyBitmap(rotateBy(doc(), degrees, secondary))
      },
      resize(width, height) {
        finishPolyline()
        commitFloating()
        applyBitmap(scale(doc(), width, height))
      },
      cropToSelection() {
        finishPolyline()
        commitFloating()
        const rect = selectionRef.current
        if (!rect) return
        const cropped = crop(doc(), rect)
        const selectionMask = maskRef.current
        if (selectionMask) {
          const local = { x: 0, y: 0, width: rect.width, height: rect.height }
          for (let y = 0; y < rect.height; y += 1) {
            for (let x = 0; x < rect.width; x += 1) {
              if (!isSelected(local, selectionMask, x, y)) cropped.set(x, y, secondary)
            }
          }
        }
        applyBitmap(cropped)
        updateSelection(null)
      },
      getSelection() {
        return selectionRef.current
      },
      clearSelection() {
        commitFloating()
        updateSelection(null)
      },
      selectAll() {
        finishPolyline()
        commitFloating()
        updateSelection({ x: 0, y: 0, width: doc().width, height: doc().height })
      },
      invertSelection() {
        finishPolyline()
        commitFloating()
        const inverted = invertSelection(selectionRef.current, maskRef.current, doc().width, doc().height)
        updateSelection(inverted?.rect ?? null, inverted?.mask ?? null)
      },
      deleteSelection() {
        finishPolyline()
        const floating = floatingRef.current
        if (floating) {
          floatingRef.current = null
          bitmapRef.current = floating.base
          paint(floating.base)
          syncHistory()
          updateSelection(null)
          return
        }
        const rect = selectionRef.current
        if (!rect) return
        historyRef.current.record(doc().clone())
        fillSelection(doc(), rect, maskRef.current, secondary)
        paint(doc())
        syncHistory()
        updateSelection(null)
      },
      getSelectionDataUrl() {
        finishPolyline()
        const floating = floatingRef.current
        if (floating) {
          const composite = floating.base.clone()
          blitAlpha(composite, floating.bitmap, floating.x, floating.y)
          const region = crop(composite, {
            x: floating.x,
            y: floating.y,
            width: floating.bitmap.width,
            height: floating.bitmap.height,
          })
          return bitmapToDataUrl(maskRef.current ? applyMask(region, maskRef.current) : region)
        }
        const rect = selectionRef.current
        if (!rect) return null
        const region = crop(doc(), rect)
        return bitmapToDataUrl(maskRef.current ? applyMask(region, maskRef.current) : region)
      },
      cutSelection() {
        finishPolyline()
        commitFloating()
        const rect = selectionRef.current
        if (!rect) return
        historyRef.current.record(doc().clone())
        fillSelection(doc(), rect, maskRef.current, secondary)
        paint(doc())
        syncHistory()
      },
    }),
    [
      applyBitmap,
      applyRotation,
      beginRotation,
      commitFloating,
      currentRect,
      doc,
      ensureFloating,
      finishPolyline,
      onSizeChange,
      paint,
      renderPreview,
      resetDocument,
      secondary,
      size.width,
      size.height,
      syncHistory,
      updateSelection,
    ],
  )

  const toPoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width === 0 ? 1 : size.width / rect.width
    const scaleY = rect.height === 0 ? 1 : size.height / rect.height
    return clampPoint(
      { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY },
      size.width,
      size.height,
    )
  }, [size.width, size.height])

  const commitText = useCallback(() => {
    const current = editorRef.current
    if (!current) return
    editorRef.current = null
    setEditor(null)
    if (current.value.trim().length === 0) return
    const rendered = renderText(current.value, { ...text, color: colorFor(current.slot) })
    if (!rendered) return
    historyRef.current.record(doc().clone())
    blitAlpha(doc(), rendered, current.x, current.y)
    paint(doc())
    syncHistory()
  }, [colorFor, doc, paint, syncHistory, text])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 && event.button !== 2) return
      if (editorRef.current) {
        commitText()
        return
      }
      event.preventDefault()
      const point = toPoint(event)
      const slot: 'primary' | 'secondary' = event.button === 2 ? 'secondary' : 'primary'

      if (tool === 'select') {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        const rect = currentRect()
        const handle = rect ? hitHandle(rect, point, HANDLE_HIT / zoom) : null
        if (rect && handle) {
          selectRef.current = { pointerId: event.pointerId, mode: 'resize', start: point, handle, origin: rect }
          return
        }
        if (rect && pointInRect(point, rect)) {
          selectRef.current = { pointerId: event.pointerId, mode: 'move', start: point, origin: rect }
          return
        }
        commitFloating()
        if (selectionShape === 'freeform') {
          selectRef.current = { pointerId: event.pointerId, mode: 'lasso', start: point, points: [point] }
          updateSelection(null)
          setLasso([point])
          return
        }
        selectRef.current = { pointerId: event.pointerId, mode: 'marquee', start: point }
        updateSelection(clampRect(normalizeRect(point, point), size.width, size.height))
        return
      }
      if (tool === 'zoom') {
        onZoomClick(slot === 'secondary' ? -1 : 1)
        return
      }
      if (tool === 'picker') {
        onPickColor(doc().get(point.x, point.y), slot)
        return
      }
      if (tool === 'fill') {
        const color = colorFor(slot)
        if (colorsEqual(doc().get(point.x, point.y), color)) return
        historyRef.current.record(doc().clone())
        floodFill(doc(), point, color)
        paint(doc())
        syncHistory()
        return
      }
      if (tool === 'text') {
        const next = { x: point.x, y: point.y, value: '', slot }
        editorRef.current = next
        setEditor(next)
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      if (isShapeTool(tool) && shapeById(shapeKind).interaction === 'polyline') {
        const now = performance.now()
        const polyline = polylineRef.current
        if (!polyline) {
          polylineRef.current = {
            kind: shapeKind,
            slot,
            base: doc().clone(),
            points: [point],
            pending: point,
            pointerId: event.pointerId,
            lastDown: { time: now, point },
          }
          setPolylineActive(true)
          previewPolyline()
          return
        }
        const { lastDown } = polyline
        if (now - lastDown.time <= DOUBLE_CLICK_MS && distance(lastDown.point, point) <= DOUBLE_CLICK_SLOP / zoom) {
          finishPolyline()
          return
        }
        polyline.lastDown = { time: now, point }
        polyline.pointerId = event.pointerId
        polyline.pending = point
        previewPolyline()
        return
      }
      const base = doc().clone()
      const stroke: StrokeState = {
        pointerId: event.pointerId,
        slot,
        tool,
        kind: shapeKind,
        start: point,
        last: point,
        base,
        recorded: false,
        points: [point],
      }
      strokeRef.current = stroke

      if (isShapeTool(tool)) {
        paint(base)
      } else {
        historyRef.current.record(base)
        stroke.recorded = true
        const color = strokeColorFor(tool, slot, primary, secondary)
        const width = strokeWidthFor(tool, brushSize)
        if (tool === 'airbrush') {
          spray(doc(), point, brushSize, color)
        } else if (tool === 'brush' && brush === 'highlighter') {
          const mask = createCoverageMask(base.width, base.height)
          stampHighlighter(mask, point, point, width)
          stroke.highlighter = mask
          bitmapRef.current = compositeHighlighter(base, mask, color, HIGHLIGHTER_ALPHA)
        } else if (tool === 'brush') {
          paintBrushStroke(doc(), point, point, { size: width, color, brush })
        } else {
          stamp(doc(), point.x, point.y, width, color, strokeShape(tool))
        }
        paint(doc())
        syncHistory()
      }
    },
    [brush, brushSize, colorFor, commitFloating, commitText, currentRect, doc, finishPolyline, onPickColor, onZoomClick, paint, previewPolyline, primary, secondary, selectionShape, shapeKind, size.height, size.width, syncHistory, toPoint, tool, updateSelection, zoom],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = toPoint(event)
      onCursorMove(point)
      if (tool === 'select' && !selectRef.current) {
        const rect = currentRect()
        const handle = rect ? hitHandle(rect, point, HANDLE_HIT / zoom) : null
        setHoverCursor(
          handle ? handleCursor(handle) : rect && pointInRect(point, rect) ? 'move' : null,
        )
      }
      const drag = selectRef.current
      if (drag && drag.pointerId === event.pointerId) {
        if (drag.mode === 'marquee') {
          updateSelection(clampRect(normalizeRect(drag.start, point), size.width, size.height))
          return
        }
        if (drag.mode === 'lasso') {
          drag.points = [...(drag.points ?? []), point]
          setLasso(drag.points)
          return
        }
        const origin = drag.origin
        if (!origin) return
        const floating = ensureFloating(origin)
        if (drag.mode === 'move') {
          const spareX = size.width - floating.bitmap.width
          const spareY = size.height - floating.bitmap.height
          const x = clamp(
            origin.x + (point.x - drag.start.x),
            Math.min(0, spareX, origin.x),
            Math.max(0, spareX, origin.x),
          )
          const y = clamp(
            origin.y + (point.y - drag.start.y),
            Math.min(0, spareY, origin.y),
            Math.max(0, spareY, origin.y),
          )
          floating.x = x
          floating.y = y
          renderPreview()
          updateSelection({ x, y, width: floating.bitmap.width, height: floating.bitmap.height }, maskRef.current)
          return
        }
        if (drag.mode === 'resize' && drag.handle) {
          const next = resizeRect(origin, drag.handle, point, size.width, size.height)
          floating.bitmap = scale(floating.source, next.width, next.height)
          floating.x = next.x
          floating.y = next.y
          renderPreview()
          updateSelection(next, maskRef.current)
          return
        }
        return
      }
      const polyline = polylineRef.current
      if (polyline) {
        if (polyline.pointerId !== null && polyline.pointerId !== event.pointerId) return
        polyline.pending = point
        previewPolyline()
        return
      }
      const stroke = strokeRef.current
      if (!stroke || stroke.pointerId !== event.pointerId) return
      if (isShapeTool(stroke.tool)) {
        if (!stroke.recorded) {
          historyRef.current.record(stroke.base.clone())
          stroke.recorded = true
          syncHistory()
        }
        stroke.points.push(point)
        const preview = stroke.base.clone()
        renderShape(preview, stroke.kind, shapePoints(stroke, point), stroke.slot)
        paint(preview)
      } else {
        const color = strokeColorFor(stroke.tool, stroke.slot, primary, secondary)
        const width = strokeWidthFor(stroke.tool, brushSize)
        if (stroke.tool === 'airbrush') {
          spray(doc(), point, brushSize, color)
        } else if (stroke.tool === 'brush' && brush === 'highlighter' && stroke.highlighter) {
          stampHighlighter(stroke.highlighter, stroke.last, point, width)
          bitmapRef.current = compositeHighlighter(stroke.base, stroke.highlighter, color, HIGHLIGHTER_ALPHA)
        } else if (stroke.tool === 'brush') {
          paintBrushStroke(doc(), stroke.last, point, { size: width, color, brush })
        } else {
          drawLine(doc(), stroke.last, point, width, color, strokeShape(stroke.tool))
        }
        paint(doc())
      }
      stroke.last = point
    },
    [brush, brushSize, currentRect, doc, ensureFloating, onCursorMove, paint, previewPolyline, primary, renderPreview, renderShape, secondary, size.height, size.width, syncHistory, toPoint, tool, updateSelection, zoom],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const drag = selectRef.current
      if (drag && drag.pointerId === event.pointerId) {
        if (drag.mode === 'marquee') {
          const rect = clampRect(normalizeRect(drag.start, toPoint(event)), size.width, size.height)
          if (rect.width < 2 && rect.height < 2) updateSelection(null)
          else updateSelection(rect)
        }
        if (drag.mode === 'lasso') {
          const traced = polygonSelection(drag.points ?? [], size.width, size.height)
          updateSelection(traced?.rect ?? null, traced?.mask ?? null)
          setLasso(null)
        }
        selectRef.current = null
        return
      }
      const polyline = polylineRef.current
      if (polyline) {
        if (polyline.pointerId !== event.pointerId) return
        const end = toPoint(event)
        if (!pointsEqual(end, polyline.points[polyline.points.length - 1])) polyline.points.push(end)
        polyline.pointerId = null
        polyline.pending = end
        previewPolyline()
        return
      }
      const stroke = strokeRef.current
      if (!stroke || stroke.pointerId !== event.pointerId) return
      if (isShapeTool(stroke.tool) && stroke.recorded) {
        const end = toPoint(event)
        if (!pointsEqual(end, stroke.points[stroke.points.length - 1])) stroke.points.push(end)
        const final = stroke.base.clone()
        renderShape(final, stroke.kind, shapePoints(stroke, end), stroke.slot)
        bitmapRef.current = final
        paint(final)
        syncHistory()
      }
      strokeRef.current = null
    },
    [paint, previewPolyline, renderShape, size.height, size.width, syncHistory, toPoint, updateSelection],
  )

  const clientToCanvas = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.width === 0 ? 0 : ((clientX - rect.left) * size.width) / rect.width,
      y: rect.height === 0 ? 0 : ((clientY - rect.top) * size.height) / rect.height,
    }
  }, [size.width, size.height])

  const handleRotateDown = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      const rotation = beginRotation()
      if (!rotation) return
      event.currentTarget.setPointerCapture?.(event.pointerId)
      const start = clientToCanvas(event.clientX, event.clientY)
      selectRef.current = { pointerId: event.pointerId, mode: 'rotate', start, rotation }
    },
    [beginRotation, clientToCanvas],
  )

  const handleRotateMove = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = selectRef.current
      if (!drag || drag.mode !== 'rotate' || drag.pointerId !== event.pointerId || !drag.rotation) return
      event.stopPropagation()
      const { center } = drag.rotation
      const point = clientToCanvas(event.clientX, event.clientY)
      const radians = pointerAngle(center, point) - pointerAngle(center, drag.start)
      applyRotation(drag.rotation, (radians * 180) / Math.PI)
    },
    [applyRotation, clientToCanvas],
  )

  const handleRotateUp = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = selectRef.current
    if (!drag || drag.mode !== 'rotate' || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    const floating = floatingRef.current
    if (floating) floating.source = floating.bitmap
    selectRef.current = null
  }, [])

  const handlePointerLeave = useCallback(() => {
    onCursorMove(null)
    const polyline = polylineRef.current
    if (polyline && polyline.pointerId === null) {
      polyline.pending = null
      previewPolyline()
    }
  }, [onCursorMove, previewPolyline])

  const cursor =
    tool === 'text' ? 'text' : tool === 'fill' ? 'cell' : tool === 'picker' ? 'copy' : tool === 'zoom' ? 'zoom-in' : tool === 'select' ? (hoverCursor ?? 'crosshair') : 'crosshair'

  return (
    <>
      <div
        className="canvas-frame"
        style={{
          width: size.width * zoom,
          height: size.height * zoom,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
        }}
      >
      <canvas
        ref={canvasRef}
        className="paint-canvas"
        style={{ width: '100%', height: '100%', cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(event) => event.preventDefault()}
      />
      {showGrid && zoom >= 4 ? (
        <div
          className="grid-overlay"
          aria-hidden="true"
          style={{ backgroundSize: `${zoom}px ${zoom}px` }}
        />
      ) : null}
      {selection ? (
        <div
          className="selection-overlay"
          aria-hidden="true"
          style={{
            left: selection.x * zoom,
            top: selection.y * zoom,
            width: selection.width * zoom,
            height: selection.height * zoom,
          }}
        >
          {mask ? <MaskOutline mask={mask} /> : null}
          {SELECTION_HANDLES.map((handle) => (
            <span key={handle} className={`selection-handle selection-handle-${handle}`} />
          ))}
          <span className="selection-rotate-line" />
          <span
            className="selection-rotate-handle"
            title="Rotate"
            onPointerDown={handleRotateDown}
            onPointerMove={handleRotateMove}
            onPointerUp={handleRotateUp}
            onPointerCancel={handleRotateUp}
          />
        </div>
      ) : null}
      {lasso ? (
        <svg
          className="lasso-overlay"
          aria-hidden="true"
          width={size.width * zoom}
          height={size.height * zoom}
        >
          <polyline
            points={lasso.map((point) => `${(point.x + 0.5) * zoom},${(point.y + 0.5) * zoom}`).join(' ')}
          />
        </svg>
      ) : null}
      {editor ? (
        <textarea
          className="text-editor"
          autoFocus
          spellCheck={false}
          value={editor.value}
          style={{
            left: editor.x * zoom,
            top: editor.y * zoom,
            fontFamily: text.fontFamily,
            fontSize: text.fontSize * zoom,
            fontWeight: text.bold ? 700 : 400,
            fontStyle: text.italic ? 'italic' : 'normal',
            textDecoration: text.underline ? 'underline' : 'none',
            lineHeight: 1.25,
            color: toCss(colorFor(editor.slot)),
          }}
          onChange={(event) => {
            const next = { ...editor, value: event.target.value }
            editorRef.current = next
            setEditor(next)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              editorRef.current = null
              setEditor(null)
            } else if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              commitText()
            }
          }}
          onBlur={commitText}
        />
      ) : null}
      </div>
      {showMiniature ? (
        <div
          className="miniature-view"
          role="group"
          aria-label="Miniature view"
          onPointerDown={handleMiniatureDown}
          onPointerMove={handleMiniatureMove}
        >
          <canvas ref={miniatureRef} className="miniature-canvas" aria-hidden="true" />
          {viewport ? (
            <span
              className="miniature-viewport"
              aria-hidden="true"
              style={{
                left: `${(viewport.x / size.width) * 100}%`,
                top: `${(viewport.y / size.height) * 100}%`,
                width: `${(viewport.width / size.width) * 100}%`,
                height: `${(viewport.height / size.height) * 100}%`,
              }}
            />
          ) : null}
        </div>
      ) : null}
    </>
  )
})
