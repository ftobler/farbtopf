import { useState } from 'react'
import { toCss, toHex, parseColor } from '../core/color'
import type { Rgba } from '../core/color'
import { MAX_CUSTOM_COLORS } from '../core/customColors'
import { ColorPicker } from './ColorPicker'
import type { ColorSlot } from './ColorPicker'
import { SwapIcon } from './icons'

export interface ColorPaletteProps {
  primary: Rgba
  secondary: Rgba
  palette: readonly string[]
  customColors: readonly string[]
  onPrimaryChange: (color: Rgba) => void
  onSecondaryChange: (color: Rgba) => void
  onSwap: () => void
  onAddCustomColor: (color: Rgba) => void
  onRemoveCustomColor: (hex: string) => void
}

export function ColorPalette({
  primary,
  secondary,
  palette,
  customColors,
  onPrimaryChange,
  onSecondaryChange,
  onSwap,
  onAddCustomColor,
  onRemoveCustomColor,
}: ColorPaletteProps) {
  const [target, setTarget] = useState<ColorSlot>('primary')
  const active = target === 'primary' ? primary : secondary

  const pick = (slot: 'primary' | 'secondary', hex: string) => {
    const color = parseColor(hex)
    if (!color) return
    if (slot === 'primary') onPrimaryChange(color)
    else onSecondaryChange(color)
  }

  const changeActive = (color: Rgba) => {
    if (target === 'primary') onPrimaryChange(color)
    else onSecondaryChange(color)
  }

  return (
    <div className="color-palette">
      <div className="current-colors">
        <label className="color-swatch primary" title={`Primary color ${toHex(primary)}`}>
          <span style={{ background: toCss(primary) }} />
          <input
            type="color"
            value={toHex(primary)}
            aria-label="Primary color"
            onChange={(event) => onPrimaryChange(parseColor(event.target.value) ?? primary)}
          />
        </label>
        <label className="color-swatch secondary" title={`Secondary color ${toHex(secondary)}`}>
          <span style={{ background: toCss(secondary) }} />
          <input
            type="color"
            value={toHex(secondary)}
            aria-label="Secondary color"
            onChange={(event) => onSecondaryChange(parseColor(event.target.value) ?? secondary)}
          />
        </label>
        <button type="button" className="icon-button swap-button" title="Swap colors (X)" aria-label="Swap colors" onClick={onSwap}>
          <SwapIcon size={18} />
        </button>
      </div>

      <div className="swatches" role="listbox" aria-label="Color palette">
        <div className="swatch-grid">
          {palette.map((hex) => (
            <button
              key={hex}
              type="button"
              className="swatch"
              style={{ background: hex }}
              title={hex}
              aria-label={`Color ${hex}`}
              onClick={() => pick('primary', hex)}
              onContextMenu={(event) => {
                event.preventDefault()
                pick('secondary', hex)
              }}
            />
          ))}
        </div>
        <div className="custom-row">
          {customColors.map((hex) => (
            <button
              key={hex}
              type="button"
              className="swatch custom"
              style={{ background: hex }}
              title={hex}
              aria-label={`Custom color ${hex}`}
              onClick={() => pick('primary', hex)}
              onContextMenu={(event) => {
                event.preventDefault()
                pick('secondary', hex)
              }}
            />
          ))}
          {Array.from({ length: Math.max(0, MAX_CUSTOM_COLORS - customColors.length) }, (_, index) => (
            <span key={`empty-${index}`} className="swatch-empty" aria-hidden="true" />
          ))}
        </div>
      </div>

      <ColorPicker
        color={active}
        target={target}
        customColors={customColors}
        onTargetChange={setTarget}
        onColorChange={changeActive}
        onAddCustomColor={onAddCustomColor}
        onRemoveCustomColor={onRemoveCustomColor}
      />
    </div>
  )
}
