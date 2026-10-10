import { describe, expect, it } from 'vitest'
import css from '../index.css?raw'
import { TOOLS, type ToolId } from './tools'
import { FILL_CURSOR, PENCIL_CURSOR } from './cursors'
import { canvasCursor, shapeHandleCursor, workspaceCursor } from './toolCursor'

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

  it('lets the Shape tool show a hover cursor over a pending shape\'s handles', () => {
    expect(canvasCursor('shape', 'nwse-resize')).toBe('nwse-resize')
    expect(canvasCursor('shape', null)).toBe('crosshair')
  })

  it('hides the pointer for the eraser only while its footprint preview stands in for it', () => {
    expect(canvasCursor('eraser', null, { eraserPreview: true })).toBe('none')
    expect(canvasCursor('eraser', null, { eraserPreview: false })).toBe('crosshair')
  })
})

describe('shapeHandleCursor', () => {
  const box = [
    { id: 'nw', point: { x: 0, y: 0 } },
    { id: 'n', point: { x: 10, y: 0 } },
    { id: 'ne', point: { x: 20, y: 0 } },
    { id: 'e', point: { x: 20, y: 10 } },
    { id: 'se', point: { x: 20, y: 20 } },
    { id: 's', point: { x: 10, y: 20 } },
    { id: 'sw', point: { x: 0, y: 20 } },
    { id: 'w', point: { x: 0, y: 10 } },
    { id: 'rotate', point: { x: 10, y: -8 } },
  ]

  it.each([
    ['nw', 'nwse-resize'],
    ['se', 'nwse-resize'],
    ['ne', 'nesw-resize'],
    ['sw', 'nesw-resize'],
    ['n', 'ns-resize'],
    ['s', 'ns-resize'],
    ['e', 'ew-resize'],
    ['w', 'ew-resize'],
  ])('points the resize cursor of box handle %s away from the centre', (id, cursor) => {
    expect(shapeHandleCursor(box, id)).toBe(cursor)
  })

  it('turns the resize cursor with a rotated box', () => {
    // The same box turned 45°: the east handle now sits towards the south-east.
    const turned = [
      { id: 'n', point: { x: 7, y: -7 } },
      { id: 'e', point: { x: 7, y: 7 } },
      { id: 's', point: { x: -7, y: 7 } },
      { id: 'w', point: { x: -7, y: -7 } },
    ]
    expect(shapeHandleCursor(turned, 'e')).toBe('nwse-resize')
    expect(shapeHandleCursor(turned, 'n')).toBe('nesw-resize')
  })

  it('shows a grab hand on the rotate handle', () => {
    expect(shapeHandleCursor(box, 'rotate')).toBe('grab')
  })

  it('shows the move cursor on free control points', () => {
    const line = [
      { id: 'p0', point: { x: 0, y: 0 } },
      { id: 'p1', point: { x: 20, y: 5 } },
    ]
    expect(shapeHandleCursor(line, 'p0')).toBe('move')
    expect(shapeHandleCursor([{ id: 'tip', point: { x: 3, y: 4 } }], 'tip')).toBe('move')
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
