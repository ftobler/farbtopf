import { parseColor, toHexWithAlpha } from './color'
import type { Rgba } from './color'

export const CUSTOM_COLORS_KEY = 'farbtopf.customColors'

export function loadCustomColors(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(CUSTOM_COLORS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const colors: string[] = []
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue
      const color = parseColor(entry)
      if (!color) continue
      const hex = toHexWithAlpha(color)
      if (!colors.includes(hex)) colors.push(hex)
    }
    return colors
  } catch {
    return []
  }
}

export function saveCustomColors(colors: readonly string[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(colors))
  } catch {
    return
  }
}

export function withCustomColor(colors: readonly string[], color: Rgba): string[] {
  const hex = toHexWithAlpha(color)
  if (colors.includes(hex)) return [...colors]
  return [...colors, hex]
}
