import { Dropdown, MenuDivider, MenuItem } from './Dropdown'
import { MoonIcon, SunIcon } from './icons'

export interface MenuBarProps {
  canUndo: boolean
  canRedo: boolean
  showGrid: boolean
  theme: 'light' | 'dark'
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onToggleGrid: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onToggleTheme: () => void
  onShowHelp: () => void
}

export function MenuBar({
  canUndo,
  canRedo,
  showGrid,
  theme,
  onNew,
  onOpen,
  onSave,
  onUndo,
  onRedo,
  onClear,
  onToggleGrid,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onToggleTheme,
  onShowHelp,
}: MenuBarProps) {
  return (
    <header className="menubar">
      <div className="menubar-menus">
        <Dropdown trigger="File" showChevron={false} triggerClassName="menubar-button">
          {(close) => (
            <>
              <MenuItem
                shortcut="Ctrl+N"
                onClick={() => {
                  onNew()
                  close()
                }}
              >
                New
              </MenuItem>
              <MenuItem
                shortcut="Ctrl+O"
                onClick={() => {
                  onOpen()
                  close()
                }}
              >
                Open…
              </MenuItem>
              <MenuItem
                shortcut="Ctrl+S"
                onClick={() => {
                  onSave()
                  close()
                }}
              >
                Save as PNG
              </MenuItem>
            </>
          )}
        </Dropdown>

        <Dropdown trigger="Edit" showChevron={false} triggerClassName="menubar-button">
          {(close) => (
            <>
              <MenuItem
                shortcut="Ctrl+Z"
                disabled={!canUndo}
                onClick={() => {
                  onUndo()
                  close()
                }}
              >
                Undo
              </MenuItem>
              <MenuItem
                shortcut="Ctrl+Y"
                disabled={!canRedo}
                onClick={() => {
                  onRedo()
                  close()
                }}
              >
                Redo
              </MenuItem>
              <MenuDivider />
              <MenuItem
                onClick={() => {
                  onClear()
                  close()
                }}
              >
                Clear canvas
              </MenuItem>
            </>
          )}
        </Dropdown>

        <Dropdown trigger="View" showChevron={false} triggerClassName="menubar-button">
          {(close) => (
            <>
              <MenuItem
                checked={showGrid}
                onClick={() => {
                  onToggleGrid()
                }}
              >
                Pixel grid
              </MenuItem>
              <MenuDivider />
              <MenuItem
                shortcut="+"
                onClick={() => {
                  onZoomIn()
                }}
              >
                Zoom in
              </MenuItem>
              <MenuItem
                shortcut="-"
                onClick={() => {
                  onZoomOut()
                }}
              >
                Zoom out
              </MenuItem>
              <MenuItem
                onClick={() => {
                  onZoomReset()
                  close()
                }}
              >
                Actual size
              </MenuItem>
            </>
          )}
        </Dropdown>

        <Dropdown trigger="Help" showChevron={false} triggerClassName="menubar-button">
          {(close) => (
            <MenuItem
              onClick={() => {
                onShowHelp()
                close()
              }}
            >
              Keyboard shortcuts
            </MenuItem>
          )}
        </Dropdown>
      </div>

      <div className="menubar-title">Farbtopf</div>

      <button
        type="button"
        className="icon-button theme-toggle"
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        aria-label="Toggle color theme"
        onClick={onToggleTheme}
      >
        {theme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
      </button>
    </header>
  )
}
