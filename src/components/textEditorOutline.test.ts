import { describe, expect, it } from 'vitest'
import css from '../index.css?raw'

/** The declarations of the rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  if (!match) throw new Error(`no rule for ${selector}`)
  return match[1]
}

/**
 * The text box shows one frame: the dashed `.text-overlay` border. The textarea
 * underneath is focused while typing, so it must not draw a border or the
 * browser's focus ring as a second (solid, dark) outline. That outline is only
 * on screen and never stamped, so it would mislead about where the text lands.
 */
describe('text editor outline', () => {
  it('draws no border or focus outline of its own', () => {
    const editor = rule('.text-editor')
    expect(editor).toMatch(/(^|;|\s)border:\s*none;/)
    expect(editor).toMatch(/(^|;|\s)outline:\s*none;/)
  })

  it('brings back no outline on focus', () => {
    const focusRules = css.match(/\.text-editor:focus[^{]*\{[^}]*\}/g) ?? []
    for (const block of focusRules) expect(block).not.toMatch(/outline:\s*(?!none)/)
  })

  it('keeps the dashed selection frame on the overlay', () => {
    expect(rule('.text-overlay')).toMatch(/border:\s*1px dashed var\(--accent\);/)
  })
})
