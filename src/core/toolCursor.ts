import { FILL_CURSOR, PENCIL_CURSOR } from './cursors'
import type { Point } from './geometry'
import type { ToolId } from './tools'

/** Each tool's cursor over the image. */
const CANVAS_CURSORS: Record<ToolId, string> = {
  select: 'crosshair',
  pencil: PENCIL_CURSOR,
  brush: 'crosshair',
  airbrush: 'crosshair',
  // The eraser's footprint preview stands in for the pointer (see canvasCursor).
  eraser: 'none',
  fill: FILL_CURSOR,
  picker: 'copy',
  shape: 'crosshair',
  text: 'text',
  zoom: 'zoom-in',
}

/**
 * Tools whose press on the workspace around the image does something: the Select
 * tool starts a selection there and drags it in. The others only act on the image
 * itself, so outside it they show the normal pointer rather than suggest otherwise.
 */
const WORKS_OUTSIDE_IMAGE: ReadonlySet<ToolId> = new Set<ToolId>(['select'])

/**
 * The cursor over the image. The Select tool shows `hover` (the move or resize
 * cursor over its selection and handles) when there is one, and so does the Shape
 * tool over a pending shape's handles. The eraser hides the
 * pointer only while its footprint preview is shown, so the pointer never vanishes
 * without something in its place.
 */
export function canvasCursor(
  tool: ToolId,
  hover?: string | null,
  { eraserPreview = true }: { eraserPreview?: boolean } = {},
): string {
  if ((tool === 'select' || tool === 'shape') && hover) return hover
  if (tool === 'eraser' && !eraserPreview) return 'crosshair'
  return CANVAS_CURSORS[tool]
}

/** The cursor over the workspace around the image, or null for the normal pointer. */
export function workspaceCursor(tool: ToolId): string | null {
  return WORKS_OUTSIDE_IMAGE.has(tool) ? CANVAS_CURSORS[tool] : null
}

const COMPASS_HANDLES: ReadonlySet<string> = new Set(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'])

/** The resize cursors by the handle's direction from the centre, in 45° steps from east. */
const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const

/**
 * The cursor over handle `id` of a pending shape. The box handles resize along the
 * line from the box centre to the handle, so the arrows follow a rotated shape; the
 * rotate handle shows a grab hand and every other control point the move cursor.
 */
export function shapeHandleCursor(handles: readonly { id: string; point: Point }[], id: string): string {
  if (id === 'rotate') return 'grab'
  const handle = handles.find((candidate) => candidate.id === id)
  const box = handles.filter((candidate) => COMPASS_HANDLES.has(candidate.id))
  if (!handle || !COMPASS_HANDLES.has(id) || box.length < 2) return 'move'
  const centreX = box.reduce((sum, { point }) => sum + point.x, 0) / box.length
  const centreY = box.reduce((sum, { point }) => sum + point.y, 0) / box.length
  const angle = Math.atan2(handle.point.y - centreY, handle.point.x - centreX)
  const step = Math.round(angle / (Math.PI / 4))
  return RESIZE_CURSORS[((step % 4) + 4) % 4]
}
