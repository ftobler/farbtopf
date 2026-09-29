import { Dropdown, MenuDivider, MenuItem } from './Dropdown'
import { GitHubIcon, LogoIcon, MoonIcon, RedoIcon, SaveIcon, SunIcon, UndoIcon } from './icons'

export interface MenuBarProps {
  canUndo: boolean
  canRedo: boolean
  theme: 'light' | 'dark'
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onToggleTheme: () => void
}

export function MenuBar({
  canUndo,
  canRedo,
  theme,
  onNew,
  onOpen,
  onSave,
  onUndo,
  onRedo,
  onClear,
  onToggleTheme,
}: MenuBarProps) {
  return (
    <header className="menubar">
      <span className="menubar-logo">
        <LogoIcon size={22} />
      </span>

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
            </>
          )}
        </Dropdown>

        <div className="menubar-actions">
          <button
            type="button"
            className="icon-button"
            title="Save as PNG (Ctrl+S)"
            aria-label="Save"
            onClick={onSave}
          >
            <SaveIcon size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <UndoIcon size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <RedoIcon size={18} />
          </button>
        </div>
      </div>

      <div className="menubar-spacer" />

      <a
        className="icon-button github-link"
        href="https://github.com/ftobler/farbtopf"
        target="_blank"
        rel="noreferrer"
        title="View source on GitHub"
        aria-label="GitHub repository"
      >
        <GitHubIcon size={18} />
      </a>

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
