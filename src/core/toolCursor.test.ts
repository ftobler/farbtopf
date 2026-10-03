import { describe, expect, it } from 'vitest'
import css from '../index.css?raw'
import { TOOLS, type ToolId } from './tools'
import { FILL_CURSOR, PENCIL_CURSOR } from './cursors'
import { canvasCursor, workspaceCursor } from './toolCursor'

describe('canvasCursor', () => {
  it('gives every tool its cursor over the image', () => {
    const expected: Record<ToolId, string> = {
      select: 'crosshair',
      pencil: PENCIL_CURSOR,
      brush: 'crosshair',
      airbrush: 'crosshair',
      eraser: 'none',
      fill: FILL_CURSOR,
      picker: 'copy',
      shape: 'crosshair',
      text: 'text',
      zoom: 'zoom-in',
    }
    for (const { id } of TOOLS) expect(canvasCursor(id)).toBe(expected[id])
  })

  it('lets the Select tool show a hover cursor over the selection and its handles', () => {
    expect(canvasCursor('select', 'move')).toBe('move')
    expect(canvasCursor('select', 'nwse-resize')).toBe('nwse-resize')
    expect(canvasCursor('select', null)).toBe('crosshair')
    expect(canvasCursor('brush', 'move')).toBe('crosshair')
  })

  it('hides the pointer for the eraser only while its footprint preview stands in for it', () => {
    expect(canvasCursor('eraser', null, { eraserPreview: true })).toBe('none')
    expect(canvasCursor('eraser', null, { eraserPreview: false })).toBe('crosshair')
  })
})

describe('workspaceCursor', () => {
  it('keeps the cursor of a tool that can start outside the image', () => {
    expect(workspaceCursor('select')).toBe('crosshair')
  })

  it('shows no tool cursor outside the image for tools that do nothing there', () => {
    for (const id of ['pencil', 'brush', 'airbrush', 'eraser', 'fill', 'picker', 'shape', 'text', 'zoom'] as const) {
      expect(workspaceCursor(id)).toBeNull()
    }
  })

  it('agrees with the cursor over the image whenever it applies', () => {
    for (const { id } of TOOLS) {
      const outside = workspaceCursor(id)
      if (outside !== null) expect(outside).toBe(canvasCursor(id))
    }
  })
})

describe('workspace cursor stylesheet', () => {
  const flat = css.replace(/\s+/g, ' ')

  it('applies the tool cursor named by the workspace data attribute', () => {
    expect(flat).toContain('.workspace[data-tool-cursor="crosshair"] { cursor: crosshair; }')
  })

  it('gives floating panels inside the workspace their normal cursor back', () => {
    expect(flat).toContain(':where(.workspace[data-tool-cursor]) > * { cursor: auto; }')
  })

  it('lets panning and the busy cursor win over the tool cursor', () => {
    const tool = flat.indexOf('.workspace[data-tool-cursor="crosshair"]')
    const panning = flat.indexOf('.workspace.panning {')
    expect(tool).toBeGreaterThan(-1)
    expect(panning).toBeGreaterThan(tool)
    expect(flat).toMatch(/\.app--busy \* \{ cursor: wait !important; \}/)
  })
})
