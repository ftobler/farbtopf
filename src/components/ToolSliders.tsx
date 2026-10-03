import type { ReactNode } from 'react'
import {
  MAX_OPACITY,
  MAX_SIZE,
  MIN_OPACITY,
  MIN_SIZE,
  clampOpacity,
  clampSize,
  opacityToSlider,
  sizeToSlider,
  sliderToOpacity,
  sliderToSize,
  stepSize,
} from '../core/toolSettings'
import { OpacityIcon, SizeIcon } from './icons'
import { Slider } from './Slider'

interface ToolSliderProps {
  label: string
  icon: ReactNode
  value: number
  min: number
  max: number
  valueText: string
  /** Where `value` sits on the track, 0 (bottom) to 1 (top). */
  position: number
  /** The value for a track position, 0 (bottom) to 1 (top). */
  fromPosition: (position: number) => number
  /** The value a key press moves to, or null for keys the slider does not handle. */
  keyStep: (value: number, key: string) => number | null
  onChange: (value: number) => void
  onSlidingChange?: (sliding: boolean) => void
}

/** One labelled vertical slider of the panel: icon and value on top, the shared slider below. */
function ToolSlider({ label, icon, valueText, ...slider }: ToolSliderProps) {
  return (
    <div className="tool-slider" title={`${label}: ${valueText}`}>
      <div className="tool-slider-header">
        {icon}
        <span className="tool-slider-value" aria-hidden="true">
          {valueText}
        </span>
      </div>
      <Slider orientation="vertical" className="tool-slider-track" label={label} valueText={valueText} {...slider} />
    </div>
  )
}

function sizeKeyStep(size: number, key: string): number | null {
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return clampSize(size + 1)
    case 'ArrowDown':
    case 'ArrowLeft':
      return clampSize(size - 1)
    case 'PageUp':
      return stepSize(size, 1)
    case 'PageDown':
      return stepSize(size, -1)
    case 'Home':
      return MIN_SIZE
    case 'End':
      return MAX_SIZE
    default:
      return null
  }
}

function opacityKeyStep(opacity: number, key: string): number | null {
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return clampOpacity(opacity + 1)
    case 'ArrowDown':
    case 'ArrowLeft':
      return clampOpacity(opacity - 1)
    case 'PageUp':
      return clampOpacity(opacity + 10)
    case 'PageDown':
      return clampOpacity(opacity - 10)
    case 'Home':
      return MIN_OPACITY
    case 'End':
      return MAX_OPACITY
    default:
      return null
  }
}

export interface ToolSlidersProps {
  /** The current tool's size in image pixels. */
  size: number
  /** The current tool's opacity in percent. */
  opacity: number
  onSizeChange: (size: number) => void
  onOpacityChange: (opacity: number) => void
  /** True while either slider is being dragged. */
  onSlidingChange?: (sliding: boolean) => void
}

/**
 * Floating size and opacity sliders for the sized tools, stacked on the left of the workspace.
 * The size slider is logarithmic so 1-10 px are as easy to pick as the big sizes.
 */
export function ToolSliders({ size, opacity, onSizeChange, onOpacityChange, onSlidingChange }: ToolSlidersProps) {
  return (
    <div
      className="tool-sliders"
      role="group"
      aria-label="Tool size and opacity"
      onContextMenu={(event) => {
        // The panel sits inside the workspace; keep the canvas context menu from opening too.
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <ToolSlider
        label="Size"
        icon={<SizeIcon size={16} className="tool-slider-icon" />}
        value={size}
        min={MIN_SIZE}
        max={MAX_SIZE}
        valueText={`${size} px`}
        position={sizeToSlider(size)}
        fromPosition={sliderToSize}
        keyStep={sizeKeyStep}
        onChange={onSizeChange}
        onSlidingChange={onSlidingChange}
      />
      <ToolSlider
        label="Opacity"
        icon={<OpacityIcon size={16} className="tool-slider-icon" />}
        value={opacity}
        min={MIN_OPACITY}
        max={MAX_OPACITY}
        valueText={`${opacity}%`}
        position={opacityToSlider(opacity)}
        fromPosition={sliderToOpacity}
        keyStep={opacityKeyStep}
        onChange={onOpacityChange}
        onSlidingChange={onSlidingChange}
      />
    </div>
  )
}
