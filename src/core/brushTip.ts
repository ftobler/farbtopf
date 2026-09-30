import { Bitmap } from './bitmap'
import {
  HIGHLIGHTER_ALPHA,
  compositeHighlighter,
  createCoverageMask,
  isColorBrush,
  paintBrushStroke,
  sprayDab,
  stampHighlighter,
} from './brushes'
import type { BrushId } from './brushes'
import type { Rgba } from './color'
import { stamp } from './raster'
import type { SizedTool } from './toolSettings'

/** The form of a tool's tip, as shown by the brush preview. */
export type TipKind = 'square' | 'round' | 'soft' | 'natural' | 'calligraphy' | 'highlighter' | 'spray' | 'area'

export function tipKind(tool: SizedTool, brush: BrushId): TipKind {
  switch (tool) {
    case 'pencil':
    case 'eraser':
      return 'square'
    case 'shape':
      return 'round'
    case 'airbrush':
      return 'spray'
    case 'brush':
      if (!isColorBrush(brush)) return 'area'
      return brush as TipKind
  }
}

/** Empty pixels around the tip so soft and slanted tips are never cut off. */
export const TIP_PADDING = 2

/**
 * One dab of the tool at `size`, drawn with the same code the tool paints with, on a
 * transparent bitmap `size + 2 * TIP_PADDING` pixels square. The tip covers the pixels
 * from TIP_PADDING to TIP_PADDING + size - 1 on both axes. Returns null for brushes
 * that only move existing pixels (blur, smudge, liquify): they have no colour to show.
 */
export function brushTip(tool: SizedTool, brush: BrushId, size: number, color: Rgba): Bitmap | null {
  const kind = tipKind(tool, brush)
  if (kind === 'area') return null
  const s = Math.max(1, Math.round(size))
  const side = s + 2 * TIP_PADDING
  const bitmap = new Bitmap(side, side)
  const offset = Math.floor((s - 1) / 2)
  const center = { x: TIP_PADDING + offset, y: TIP_PADDING + offset }
  switch (kind) {
    case 'square':
      stamp(bitmap, center.x, center.y, s, color, 'square')
      return bitmap
    case 'round':
      if (tool === 'shape') stamp(bitmap, center.x, center.y, s, color, 'round')
      else paintBrushStroke(bitmap, center, center, { size: s, color, brush })
      return bitmap
    case 'spray':
      sprayDab(bitmap, { x: TIP_PADDING + (s - 1) / 2, y: TIP_PADDING + (s - 1) / 2 }, s, color)
      return bitmap
    case 'highlighter': {
      const mask = createCoverageMask(side, side)
      stampHighlighter(mask, center, center, s)
      return compositeHighlighter(bitmap, mask, color, HIGHLIGHTER_ALPHA)
    }
    default:
      paintBrushStroke(bitmap, center, center, { size: s, color, brush })
      return bitmap
  }
}
