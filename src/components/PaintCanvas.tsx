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
import type { Rgba } from '../core/color'
import { WHITE, colorsEqual, toCss } from '../core/color'
import type { Point, Rect } from '../core/geometry'
import { clamp, clampPoint, distance, normalizeRect, pointInRect } from '../core/geometry'
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
import { renderShape as drawShape } from '../core/shapes'
import type { ShapeKind } from '../core/shapes'
import type { ShapeFill, ToolId } from '../core/tools'
import { isShapeTool, strokeColorFor, strokeWidthFor } from '../core/tools'
import { bitmapFromDataUrl } from '../render/image'
import { fontSizeForBrush, renderText } from '../render/text'

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
}

interface StrokeState {
  pointerId: number
  slot: 'primary' | 'secondary'
  tool: ToolId
  start: Point
  last: Point
  base: Bitmap
  recorded: boolean
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
    showGrid,
    onHistoryChange,
    onCursorMove,
    onPickColor,
    onSizeChange,
    onSelectionChange = () => {},
    onZoomClick = () => {},
    transparentSelection,
    selectionShape = 'rectangle',
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const bitmapRef = useRef<Bitmap | null>(null)
  const historyRef = useRef(new History<Bitmap>(HISTORY_LIMIT))
  const strokeRef = useRef<StrokeState | null>(null)
  const editorRef = useRef<TextEditorState | null>(null)
  const selectionRef = useRef<Rect | null>(null)
  const maskRef = useRef<SelectionMask | null>(null)
  const selectRef = useRef<SelectDrag | null>(null)
  const floatingRef = useRef<FloatingSelection | null>(null)
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight })
  const [editor, setEditor] = useState<TextEditorState | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const [mask, setMask] = useState<SelectionMask | null>(null)
  const [lasso, setLasso] = useState<Point[] | null>(null)
  const [hoverCursor, setHoverCursor] = useState<string | null>(null)

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
    context.putImageData(bitmap.toImageData(), 0, 0)
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
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = size.width
    canvas.height = size.height
    paint(doc())
  }, [size, paint, doc])

  const resetDocument = useCallback(
    (bitmap: Bitmap) => {
      bitmapRef.current = bitmap
      historyRef.current = new History<Bitmap>(HISTORY_LIMIT)
      editorRef.current = null
      floatingRef.current = null
      setEditor(null)
      setSize({ width: bitmap.width, height: bitmap.height })
      onSizeChange(bitmap.width, bitmap.height)
      updateSelection(null)
      syncHistory()
    },
    [onSizeChange, syncHistory, updateSelection],
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
        commitFloating()
        const history = historyRef.current
        history.record(doc().clone())
        doc().fill(WHITE)
        paint(doc())
        syncHistory()
      },
      undo() {
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
        return canvasRef.current?.toDataURL('image/png') ?? ''
      },
      getSize() {
        return { width: size.width, height: size.height }
      },
      flip(axis) {
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
        commitFloating()
        applyBitmap(scale(doc(), width, height))
      },
      cropToSelection() {
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
        commitFloating()
        updateSelection({ x: 0, y: 0, width: doc().width, height: doc().height })
      },
      invertSelection() {
        commitFloating()
        const inverted = invertSelection(selectionRef.current, maskRef.current, doc().width, doc().height)
        updateSelection(inverted?.rect ?? null, inverted?.mask ?? null)
      },
      deleteSelection() {
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

  const colorFor = useCallback(
    (slot: 'primary' | 'secondary') => (slot === 'secondary' ? secondary : primary),
    [primary, secondary],
  )

  const toPoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return clampPoint(
      { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY },
      canvas.width,
      canvas.height,
    )
  }, [])

  const renderShape = useCallback(
    (target: Bitmap, start: Point, end: Point, slot: 'primary' | 'secondary') => {
      const color = colorFor(slot)
      const fillColor = slot === 'secondary' ? primary : secondary
      drawShape(target, shapeKind, [start, end], {
        width: brushSize,
        stroke: shapeFill === 'filled' ? null : color,
        fill: shapeFill === 'filled' ? color : shapeFill === 'outline-filled' ? fillColor : null,
      })
    },
    [brushSize, colorFor, primary, secondary, shapeFill, shapeKind],
  )

  const commitText = useCallback(() => {
    const current = editorRef.current
    if (!current) return
    editorRef.current = null
    setEditor(null)
    if (current.value.trim().length === 0) return
    const rendered = renderText(current.value, {
      fontSize: fontSizeForBrush(brushSize),
      color: colorFor(current.slot),
    })
    if (!rendered) return
    historyRef.current.record(doc().clone())
    blitAlpha(doc(), rendered, current.x, current.y)
    paint(doc())
    syncHistory()
  }, [brushSize, colorFor, doc, paint, syncHistory])

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
      const base = doc().clone()
      const stroke: StrokeState = {
        pointerId: event.pointerId,
        slot,
        tool,
        start: point,
        last: point,
        base,
        recorded: false,
      }
      strokeRef.current = stroke

      if (isShapeTool(tool)) {
        paint(base)
      } else {
        historyRef.current.record(base)
        stroke.recorded = true
        const color = strokeColorFor(tool, slot, primary, secondary)
        if (tool === 'airbrush') spray(doc(), point, brushSize, color)
        else stamp(doc(), point.x, point.y, strokeWidthFor(tool, brushSize), color, strokeShape(tool))
        paint(doc())
        syncHistory()
      }
    },
    [brushSize, colorFor, commitFloating, commitText, currentRect, doc, onPickColor, onZoomClick, paint, primary, secondary, selectionShape, size.height, size.width, syncHistory, toPoint, tool, updateSelection, zoom],
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
      const stroke = strokeRef.current
      if (!stroke || stroke.pointerId !== event.pointerId) return
      if (isShapeTool(stroke.tool)) {
        if (!stroke.recorded) {
          historyRef.current.record(stroke.base.clone())
          stroke.recorded = true
          syncHistory()
        }
        const preview = stroke.base.clone()
        renderShape(preview, stroke.start, point, stroke.slot)
        paint(preview)
      } else {
        const color = strokeColorFor(stroke.tool, stroke.slot, primary, secondary)
        if (stroke.tool === 'airbrush') spray(doc(), point, brushSize, color)
        else
          drawLine(
            doc(),
            stroke.last,
            point,
            strokeWidthFor(stroke.tool, brushSize),
            color,
            strokeShape(stroke.tool),
          )
        paint(doc())
      }
      stroke.last = point
    },
    [brushSize, currentRect, doc, ensureFloating, onCursorMove, paint, primary, renderPreview, renderShape, secondary, size.height, size.width, syncHistory, toPoint, tool, updateSelection, zoom],
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
      const stroke = strokeRef.current
      if (!stroke || stroke.pointerId !== event.pointerId) return
      if (isShapeTool(stroke.tool) && stroke.recorded) {
        const end = toPoint(event)
        const final = stroke.base.clone()
        renderShape(final, stroke.start, end, stroke.slot)
        bitmapRef.current = final
        paint(final)
        syncHistory()
      }
      strokeRef.current = null
    },
    [paint, renderShape, size.height, size.width, syncHistory, toPoint, updateSelection],
  )

  const clientToCanvas = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) * canvas.width) / rect.width,
      y: ((clientY - rect.top) * canvas.height) / rect.height,
    }
  }, [])

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
  }, [onCursorMove])

  const cursor =
    tool === 'text' ? 'text' : tool === 'fill' ? 'cell' : tool === 'picker' ? 'copy' : tool === 'zoom' ? 'zoom-in' : tool === 'select' ? (hoverCursor ?? 'crosshair') : 'crosshair'

  return (
    <div
      className="canvas-frame"
      style={{ width: size.width * zoom, height: size.height * zoom }}
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
            fontSize: fontSizeForBrush(brushSize) * zoom,
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
  )
})
