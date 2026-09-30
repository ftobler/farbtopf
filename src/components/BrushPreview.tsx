import { useEffect, useMemo, useRef } from 'react'
import type { BrushId } from '../core/brushes'
import { TIP_PADDING, brushTip, tipKind } from '../core/brushTip'
import type { Rgba } from '../core/color'
import type { SizedTool } from '../core/toolSettings'

export interface BrushPreviewProps {
  tool: SizedTool
  brush: BrushId
  /** Tip size in image pixels. */
  size: number
  /** Opacity in percent. */
  opacity: number
  /** The colour the tool paints with (the background colour for the eraser). */
  color: Rgba
  /** Screen pixels per image pixel, so the tip shows at its true size on the canvas. */
  zoom: number
}

/**
 * A single dab of the current tool, shown in the middle of the workspace while a tool
 * slider is dragged. It is an overlay only: nothing is drawn into the image or history.
 */
export function BrushPreview({ tool, brush, size, opacity, color, zoom }: BrushPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const kind = tipKind(tool, brush)
  const tip = useMemo(() => brushTip(tool, brush, size, color), [tool, brush, size, color])

  useEffect(() => {
    if (!tip) return
    canvasRef.current?.getContext('2d')?.putImageData(tip.toImageData(), 0, 0)
  }, [tip])

  const side = size * zoom
  return (
    <div
      className="brush-preview"
      aria-hidden="true"
      data-tip={kind}
      style={{ width: side, height: side, opacity: opacity / 100 }}
    >
      {tip ? (
        <canvas
          ref={canvasRef}
          className="brush-preview-tip"
          width={tip.width}
          height={tip.height}
          style={{
            left: -TIP_PADDING * zoom,
            top: -TIP_PADDING * zoom,
            width: tip.width * zoom,
            height: tip.height * zoom,
          }}
        />
      ) : (
        <span className="brush-preview-area" />
      )}
    </div>
  )
}
