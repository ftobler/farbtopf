import { toCss, toHex, parseColor } from '../core/color'
import type { Rgba } from '../core/color'
import { SwapIcon } from './icons'

export interface ColorPaletteProps {
  primary: Rgba
  secondary: Rgba
  palette: readonly string[]
  onPrimaryChange: (color: Rgba) => void
  onSecondaryChange: (color: Rgba) => void
  onSwap: () => void
}

export function ColorPalette({
  primary,
  secondary,
  palette,
  onPrimaryChange,
  onSecondaryChange,
  onSwap,
}: ColorPaletteProps) {
  const pick = (slot: 'primary' | 'secondary', hex: string) => {
    const color = parseColor(hex)
    if (!color) return
    if (slot === 'primary') onPrimaryChange(color)
    else onSecondaryChange(color)
  }

  return (
    <div className="color-palette">
      <div className="current-colors">
        <label className="color-swatch secondary" title={`Secondary color ${toHex(secondary)}`}>
          <span style={{ background: toCss(secondary) }} />
          <input
            type="color"
            value={toHex(secondary)}
            aria-label="Secondary color"
            onChange={(event) => onSecondaryChange(parseColor(event.target.value) ?? secondary)}
          />
        </label>
        <label className="color-swatch primary" title={`Primary color ${toHex(primary)}`}>
          <span style={{ background: toCss(primary) }} />
          <input
            type="color"
            value={toHex(primary)}
            aria-label="Primary color"
            onChange={(event) => onPrimaryChange(parseColor(event.target.value) ?? primary)}
          />
        </label>
        <button type="button" className="icon-button swap-button" title="Swap colors (X)" aria-label="Swap colors" onClick={onSwap}>
          <SwapIcon size={16} />
        </button>
      </div>

      <div className="swatches" role="listbox" aria-label="Color palette">
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
    </div>
  )
}
