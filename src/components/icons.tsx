import type { SVGProps } from 'react'
import { sineWavePath, strokePreviewWidth } from '../core/strokeWave'

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </Svg>
  )
}

export function BrushIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 5.5 18.5 9" />
      <path d="M9.5 11 13 7.5l4 4L13.5 15z" />
      <path d="M9.5 11c-2.5.6-3.5 2.6-3.9 4.2-.2.9-.3 1.9-1.6 2.8 1.6.9 3.3 1.1 4.4.4 1.2-.8 1.4-2 1.1-3.4" />
    </Svg>
  )
}

export function AirbrushIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 9.5 17.5 5a2 2 0 0 1 3 0l-1.5 1.5.5.5L18 8.5" />
      <path d="M8.5 14 13 9.5l2.5 2.5L11 16.5z" />
      <path d="M11 16.5c-1.8 1.4-3 2.2-4.4 2.2M6 12.5l-1.5-1M4.5 16.5l-2-.2M8 20l-.5 1.5" />
    </Svg>
  )
}

export function EraserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 16.5 12.5 8a2 2 0 0 1 2.8 0l3.7 3.7a2 2 0 0 1 0 2.8L14 20H7z" />
      <path d="M10 20l-3-3" />
      <path d="M9 11.5 14.5 17" />
    </Svg>
  )
}

export function FillIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 5 10a2.5 2.5 0 0 0 0 3.5L9 17.5a2.5 2.5 0 0 0 3.5 0L19 11z" />
      <path d="M8.5 6.5 5.5 3.5" />
      <path d="M20 15c1.2 1.6 1.8 2.6 1.8 3.4A1.8 1.8 0 0 1 20 20a1.8 1.8 0 0 1-1.8-1.6c0-.8.6-1.8 1.8-3.4z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function PickerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        stroke="none"
        d="M17.66 5.41l.92.92-2.69 2.69-.92-.92 2.69-2.69M17.67 3c-.26 0-.51.1-.71.29l-3.12 3.12-1.93-1.91-1.41 1.41 1.42 1.42L4.62 15.2c-.39.39-.61.9-.61 1.41V21h4.39c.51 0 1.02-.2 1.41-.59l7.05-7.05 1.42 1.41 1.41-1.41-1.91-1.93 3.12-3.12c.38-.38.38-1.02 0-1.41l-2.53-2.52c-.2-.2-.45-.29-.71-.29z"
      />
    </Svg>
  )
}

export function PaletteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3a9 9 0 0 0 0 18h1.6a1.9 1.9 0 0 0 0-3.8h-1a1.9 1.9 0 0 1 0-3.8h4.3A4.1 4.1 0 0 0 21 9.3C21 5.6 17 3 12 3Z" />
      <circle cx="7.7" cy="11.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="7.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="17.6" cy="10.6" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function TextIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 6h14" />
      <path d="M12 6v13" />
      <path d="M9 19h6" />
    </Svg>
  )
}

export function PasteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M12 10v5M9.5 12.5 12 15l2.5-2.5" />
    </Svg>
  )
}

export function CutIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8.1 7.6 20 18M8.1 16.4 20 6" />
    </Svg>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  )
}

export function LineIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 19 19 5" />
      <circle cx="5" cy="19" r="1.6" />
      <circle cx="19" cy="5" r="1.6" />
    </Svg>
  )
}

export function RectangleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </Svg>
  )
}

export function EllipseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="12" rx="8" ry="6" />
    </Svg>
  )
}

export function OutlineShapeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </Svg>
  )
}

export function FilledShapeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function OutlineFilledIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/**
 * The "sine wave button" icon for the stroke size control: a wide (2:1) icon with a thin
 * wave above a thicker one, each one full sine wavelength, hinting at a choice of sizes.
 */
export function StrokeSizeIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg
      className="stroke-size-icon"
      width={size * 2}
      height={size}
      viewBox="0 0 48 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={sineWavePath(4, 44, 6.5, 2.5)} strokeWidth={1.5} />
      <path d={sineWavePath(4, 44, 16.5, 2.5)} strokeWidth={4} />
    </svg>
  )
}

const PREVIEW_W = 48
const PREVIEW_H = 24

/** A stroke size menu entry's preview: the stroke size wave drawn at that size's thickness. */
export function StrokeSizePreview({ size }: { size: number }) {
  const width = strokePreviewWidth(size)
  const cy = PREVIEW_H / 2
  const amp = Math.min(5, Math.max(1.5, cy - width / 2 - 1))
  const pad = width / 2 + 1
  return (
    <svg
      className="size-wave"
      width={PREVIEW_W}
      height={PREVIEW_H}
      viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={sineWavePath(pad, PREVIEW_W - pad, cy, amp)} strokeWidth={width} />
    </svg>
  )
}

/** The spray can brush: a can with a nozzle and a puff of dots. */
export function SprayCanIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="10" width="8" height="11" rx="1.5" />
      <path d="M7 10V7.5h4V10M8.5 7.5V5.5h2" />
      <g fill="currentColor" stroke="none">
        <circle cx="15" cy="5" r="0.9" />
        <circle cx="18" cy="3.5" r="0.9" />
        <circle cx="18.5" cy="7" r="0.9" />
        <circle cx="21" cy="5" r="0.9" />
        <circle cx="21" cy="9" r="0.9" />
        <circle cx="16" cy="8.5" r="0.9" />
      </g>
    </Svg>
  )
}

/** The pixelate brush: a mosaic of blocks in three shades. */
export function PixelateIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M4 9.33h16M4 14.67h16M9.33 4v16M14.67 4v16" strokeWidth={1.2} />
      <g fill="currentColor" stroke="none">
        <rect x="4" y="4" width="5.33" height="5.33" />
        <rect x="14.67" y="9.33" width="5.33" height="5.33" />
        <rect x="9.33" y="14.67" width="5.33" height="5.33" />
      </g>
      <rect x="9.33" y="4" width="5.33" height="5.33" fill="currentColor" stroke="none" opacity={0.45} />
      <rect x="4" y="14.67" width="5.33" height="5.33" fill="currentColor" stroke="none" opacity={0.45} />
    </Svg>
  )
}

/** The round brush: a crisp filled disc. */
export function RoundBrushIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** The circle-blurred brush: a solid core fading out through soft rings. */
export function SoftBrushIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="6.5" opacity={0.4} strokeWidth={3} />
      <circle cx="12" cy="12" r="9.5" opacity={0.18} strokeWidth={2} />
    </Svg>
  )
}

/** The calligraphy pen: a nib with a vent hole. */
export function CalligraphyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 19 10 12 21 5 10z" />
      <path d="M12 3v7" />
      <circle cx="12" cy="12.5" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** The highlighter pen: an angled marker with a wide chisel tip. */
export function HighlighterIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3.5 20.5 10 13 17.5 6.5 11z" />
      <path d="M6.5 11 3.5 15.5 8.5 20.5 13 17.5z" />
      <path d="M10.5 7 17 13.5" />
    </Svg>
  )
}

/** The selective blur: a droplet with a soft inner edge. */
export function BlurIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5c3.5 4.2 6 7.4 6 10.7a6 6 0 0 1-12 0c0-3.3 2.5-6.5 6-10.7z" />
      <path d="M9.2 14.8a3.2 3.2 0 0 0 3.1 2.7" opacity={0.5} />
    </Svg>
  )
}

/** The smudge brush: colour dragged out into a smear. */
export function SmudgeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="15" cy="12" r="4.5" fill="currentColor" stroke="none" />
      <circle cx="11" cy="12" r="4.5" fill="currentColor" stroke="none" opacity={0.45} />
      <circle cx="7" cy="12" r="4" fill="currentColor" stroke="none" opacity={0.2} />
    </Svg>
  )
}

/** The liquify brush: ripples pushing pixels around. */
export function LiquifyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9c2.7-4 5.3 4 8 0s5.3-4 8 0" />
      <path d="M4 15c2.7-4 5.3 4 8 0s5.3-4 8 0" opacity={0.55} />
    </Svg>
  )
}

/** Stroke size: three dots growing from small to large. */
export function SizeIcon({ className, ...props }: IconProps) {
  return (
    <Svg className={['size-icon', className].filter(Boolean).join(' ')} {...props} stroke="none" fill="currentColor">
      <circle cx="4.5" cy="15" r="1.5" />
      <circle cx="10" cy="14" r="2.5" />
      <circle cx="17.5" cy="12.5" r="4" />
    </Svg>
  )
}

/** Opacity: a drop, half solid and half hollow. */
export function OpacityIcon({ className, ...props }: IconProps) {
  return (
    <Svg className={['opacity-icon', className].filter(Boolean).join(' ')} {...props}>
      <path d="M12 3.5c3 3.6 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 3-6.9 6-10.5z" />
      <path d="M12 3.5c-3 3.6-6 7-6 10.5a6 6 0 0 0 6 6z" fill="currentColor" />
    </Svg>
  )
}

export function UndoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <g transform="translate(0 -3)">
        <path d="M8 8 4.5 11.5 8 15" />
        <path d="M4.5 11.5H14a5 5 0 0 1 0 10h-3" />
      </g>
    </Svg>
  )
}

export function RedoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <g transform="translate(0 -3)">
        <path d="m16 8 3.5 3.5L16 15" />
        <path d="M19.5 11.5H10a5 5 0 0 0 0 10h3" />
      </g>
    </Svg>
  )
}

export function NewIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M12 11v6M9 14h6" />
    </Svg>
  )
}

export function OpenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h6l2 2h10v11H3z" />
    </Svg>
  )
}

export function SaveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v5h7V4" />
      <rect x="8" y="13" width="8" height="7" />
    </Svg>
  )
}

export function SaveAsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20H5V4h11l3 3v4" />
      <path d="M8 4v5h7V4" />
      <path d="M14 20l1-3 5-5 2 2-5 5z" />
    </Svg>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v11M7 10l5 5 5-5" />
      <path d="M5 19h14" />
    </Svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  )
}

export function MagnifierIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="6" />
      <path d="M20 20l-5.5-5.5" />
    </Svg>
  )
}

export function ZoomInIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5M11 8.5v5M8.5 11h5" />
    </Svg>
  )
}

export function ZoomOutIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5M8.5 11h5" />
    </Svg>
  )
}

export function GridIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 10h16M4 15h16M10 4v16M15 4v16" />
    </Svg>
  )
}

export function FullscreenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9V5a1 1 0 0 1 1-1h4" />
      <path d="M15 4h4a1 1 0 0 1 1 1v4" />
      <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
      <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
    </Svg>
  )
}

export function MiniatureIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <rect x="12.5" y="11.5" width="5.5" height="4.5" rx="0.6" />
    </Svg>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </Svg>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </Svg>
  )
}

export function GitHubIcon(props: IconProps) {
  return (
    <Svg fill="currentColor" stroke="none" {...props}>
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.85.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 2.5-.34c.85 0 1.71.12 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </Svg>
  )
}

export function SwapIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 8h11l-3-3M18 16H7l3 3" />
    </Svg>
  )
}

export function LayersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </Svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function ChevronIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m7 10 5 5 5-5" />
    </Svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 13 4.5 4.5L19 7" />
    </Svg>
  )
}

export function FreeformSelectIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M6 5.5c3-2 8.5-2 12 .5s2 7-2 8.5-5.5 0-6.5 2.5-2.5 3.5-4.5 2S4 13 3.8 10.5 4 7 6 5.5Z"
        strokeDasharray="3 3"
      />
    </Svg>
  )
}

export function SelectIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" strokeDasharray="3 3" />
    </Svg>
  )
}

export function CropIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 2v15a2 2 0 0 0 2 2h15" />
      <path d="M2 7h15a2 2 0 0 1 2 2v15" />
    </Svg>
  )
}

export function ScaleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 3.5H3.5V9" />
      <path d="M6 18 18 6" />
      <path d="M13 6h5v5" />
      <path d="M11 18H6v-5" />
    </Svg>
  )
}

export function FlipIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v18" strokeDasharray="2 2" />
      <path d="M9 5 3 12l6 7z" />
      <path d="M15 5l6 7-6 7z" />
    </Svg>
  )
}

export function RotateIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 1 2.5 6" />
      <path d="M3 7v5h5" />
    </Svg>
  )
}

export function RotateLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9.5A8 8 0 1 1 5.5 17" />
      <path d="M3.5 4.5v5h5" />
    </Svg>
  )
}

export function RotateRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 9.5A8 8 0 1 0 18.5 17" />
      <path d="M20.5 4.5v5h-5" />
    </Svg>
  )
}

export function Rotate180Icon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 11a7 7 0 0 1 14 0v4" />
      <path d="m15.5 12 3.5 3.5 3.5-3.5" />
      <path d="M5 11v8" />
    </Svg>
  )
}

export function FlipVerticalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12h18" strokeDasharray="2 2" />
      <path d="M5 9l7-6 7 6z" />
      <path d="M5 15l7 6 7-6z" />
    </Svg>
  )
}

export function InvertSelectionIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" strokeDasharray="3 3" />
      <rect x="8" y="8" width="8" height="8" rx="0.5" fill="currentColor" fillOpacity={0.35} />
    </Svg>
  )
}

/** Select all: a dashed marquee showing its corner handles. */
export function SelectAllIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" strokeDasharray="3 3" />
      <g fill="currentColor" stroke="none">
        <rect x="2.1" y="2.1" width="2.6" height="2.6" rx="0.5" />
        <rect x="19.3" y="2.1" width="2.6" height="2.6" rx="0.5" />
        <rect x="2.1" y="19.3" width="2.6" height="2.6" rx="0.5" />
        <rect x="19.3" y="19.3" width="2.6" height="2.6" rx="0.5" />
      </g>
    </Svg>
  )
}

/** Transparent selection: a marquee filled with a transparency checkerboard. */
export function TransparentSelectionIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" strokeDasharray="3 3" />
      <g fill="currentColor" stroke="none">
        <rect x="8" y="8" width="4" height="4" opacity={0.55} />
        <rect x="12" y="12" width="4" height="4" opacity={0.55} />
        <rect x="12" y="8" width="4" height="4" opacity={0.2} />
        <rect x="8" y="12" width="4" height="4" opacity={0.2} />
      </g>
    </Svg>
  )
}

export function InvertColorsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
    </Svg>
  )
}

/** Gaussian blur: a dot fading out in soft rings. */
export function GaussianBlurIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="5.75" opacity={0.55} />
      <circle cx="12" cy="12" r="8.5" opacity={0.25} strokeDasharray="2 2.5" />
    </Svg>
  )
}
