import { FILL_CURSOR, PENCIL_CURSOR } from './cursors'
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
 * cursor over its selection and handles) when there is one. The eraser hides the
 * pointer only while its footprint preview is shown, so the pointer never vanishes
 * without something in its place.
 */
export function canvasCursor(
  tool: ToolId,
  hover?: string | null,
  { eraserPreview = true }: { eraserPreview?: boolean } = {},
): string {
  if (tool === 'select' && hover) return hover
  if (tool === 'eraser' && !eraserPreview) return 'crosshair'
  return CANVAS_CURSORS[tool]
}

/** The cursor over the workspace around the image, or null for the normal pointer. */
export function workspaceCursor(tool: ToolId): string | null {
  return WORKS_OUTSIDE_IMAGE.has(tool) ? CANVAS_CURSORS[tool] : null
}
