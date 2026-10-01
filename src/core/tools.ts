import type { Rgba } from './color'

export type ToolId =
  | 'select'
  | 'pencil'
  | 'brush'
  | 'airbrush'
  | 'eraser'
  | 'fill'
  | 'picker'
  | 'shape'
  | 'text'
  | 'zoom'

export type ToolGroup = 'freehand' | 'shape' | 'utility'

export type ShapeFill = 'outline' | 'filled' | 'outline-filled'

export interface ToolDef {
  id: ToolId
  label: string
  shortcut: string
  group: ToolGroup
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'select', label: 'Select', shortcut: 'S', group: 'utility' },
  { id: 'pencil', label: 'Pencil', shortcut: 'P', group: 'freehand' },
  { id: 'brush', label: 'Brush', shortcut: 'B', group: 'freehand' },
  { id: 'airbrush', label: 'Airbrush', shortcut: 'A', group: 'freehand' },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', group: 'freehand' },
  { id: 'fill', label: 'Fill with color', shortcut: 'F', group: 'utility' },
  { id: 'picker', label: 'Color picker', shortcut: 'K', group: 'utility' },
  { id: 'text', label: 'Text', shortcut: 'T', group: 'utility' },
  { id: 'zoom', label: 'Zoom', shortcut: 'Z', group: 'utility' },
  { id: 'shape', label: 'Shape', shortcut: 'U', group: 'shape' },
]

export function isShapeTool(id: ToolId): boolean {
  return id === 'shape'
}

/** Tools that act on a right click (with the secondary colour, or zooming out) rather than open the context menu. */
const RIGHT_CLICK_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['zoom', 'fill', 'picker', 'eraser', 'pencil', 'brush', 'airbrush'])

export function rightClickActs(id: ToolId): boolean {
  return RIGHT_CLICK_TOOLS.has(id)
}

/** The stroke width a tool paints with: its size as whole pixels from 1 to 500. */
export function strokeWidthFor(_id: ToolId, brushSize: number): number {
  return Math.min(500, Math.max(1, Math.round(Number.isFinite(brushSize) ? brushSize : 1)))
}

/** The eraser swaps the colours: the secondary one on the left button, the primary one on the right. */
export function strokeColorFor(
  id: ToolId,
  slot: 'primary' | 'secondary',
  primary: Rgba,
  secondary: Rgba,
): Rgba {
  if (id === 'eraser') return slot === 'secondary' ? primary : secondary
  return slot === 'secondary' ? secondary : primary
}

export function toolById(id: ToolId): ToolDef {
  const found = TOOLS.find((tool) => tool.id === id)
  if (!found) throw new Error(`Unknown tool: ${id}`)
  return found
}

/** Preset sizes offered by the Stroke size dropdown; a tool's size may be any value from 1 to 500. */
export const BRUSH_SIZES = [1, 2, 3, 4, 5, 8, 12, 20, 32] as const
