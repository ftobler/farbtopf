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

/** Pencil is always a single pixel wide; every other tool honours the brush size. */
export function strokeWidthFor(id: ToolId, brushSize: number): number {
  return id === 'pencil' ? 1 : brushSize
}

/** The eraser always paints with the secondary colour, whatever button is used. */
export function strokeColorFor(
  id: ToolId,
  slot: 'primary' | 'secondary',
  primary: Rgba,
  secondary: Rgba,
): Rgba {
  if (id === 'eraser') return secondary
  return slot === 'secondary' ? secondary : primary
}

export function toolById(id: ToolId): ToolDef {
  const found = TOOLS.find((tool) => tool.id === id)
  if (!found) throw new Error(`Unknown tool: ${id}`)
  return found
}

export const BRUSH_SIZES = [1, 2, 3, 5, 8, 12, 20, 32] as const
