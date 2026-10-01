import { useId, useState } from 'react'
import { nextZoom } from '../core/zoom'
import { Dropdown, MenuDivider, MenuItem, MenuSubmenu } from './Dropdown'
import {
  CopyIcon,
  CutIcon,
  DownloadIcon,
  FullscreenIcon,
  GitHubIcon,
  GridIcon,
  MagnifierIcon,
  MiniatureIcon,
  MoonIcon,
  NewIcon,
  OpenIcon,
  PasteIcon,
  RedoIcon,
  SaveAsIcon,
  SaveIcon,
  ScaleIcon,
  SunIcon,
  TrashIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons'

export interface MenuBarProps {
  canUndo: boolean
  canRedo: boolean
  theme: 'light' | 'dark'
  zoom: number
  showGrid: boolean
  isFullscreen: boolean
  showMiniature: boolean
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onDownload: () => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onCopyVisible: () => void
  onZoomChange: (zoom: number) => void
  onZoomFit: () => void
  onToggleGrid: () => void
  onToggleFullscreen: () => void
  onToggleMiniature: () => void
  onToggleTheme: () => void
}

export function MenuBar({
  canUndo,
  canRedo,
  theme,
  zoom,
  showGrid,
  isFullscreen,
  showMiniature,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onDownload,
  onUndo,
  onRedo,
  onClear,
  onCut,
  onCopy,
  onPaste,
  onCopyVisible,
  onZoomChange,
  onZoomFit,
  onToggleGrid,
  onToggleFullscreen,
  onToggleMiniature,
  onToggleTheme,
}: MenuBarProps) {
  return (
    <header className="menubar">
      <AppLogo />

      <div className="menubar-menus">
        <Dropdown trigger="File" showChevron={false} triggerClassName="menubar-button">
          {(close) => (
            <>
              <MenuItem
                icon={<NewIcon size={16} />}
                shortcut="Ctrl+N"
                onClick={() => {
                  onNew()
                  close()
                }}
              >
                New
              </MenuItem>
              <MenuItem
                icon={<OpenIcon size={16} />}
                shortcut="Ctrl+O"
                onClick={() => {
                  onOpen()
                  close()
                }}
              >
                Open…
              </MenuItem>
              <MenuItem
                icon={<SaveIcon size={16} />}
                shortcut="Ctrl+S"
                onClick={() => {
                  onSave()
                  close()
                }}
              >
                Save
              </MenuItem>
              <MenuItem
                icon={<SaveAsIcon size={16} />}
                onClick={() => {
                  onSaveAs()
                  close()
                }}
              >
                Save as…
              </MenuItem>
              <MenuItem
                icon={<DownloadIcon size={16} />}
                onClick={() => {
                  onDownload()
                  close()
                }}
              >
                Download PNG
              </MenuItem>
              <MenuDivider />
              <MenuItem
                icon={<TrashIcon size={16} />}
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
                icon={<UndoIcon size={16} />}
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
                icon={<RedoIcon size={16} />}
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
                icon={<CutIcon size={16} />}
                shortcut="Ctrl+X"
                onClick={() => {
                  onCut()
                  close()
                }}
              >
                Cut
              </MenuItem>
              <MenuItem
                icon={<CopyIcon size={16} />}
                shortcut="Ctrl+C"
                onClick={() => {
                  onCopy()
                  close()
                }}
              >
                Copy
              </MenuItem>
              <MenuItem
                icon={<PasteIcon size={16} />}
                shortcut="Ctrl+V"
                onClick={() => {
                  onPaste()
                  close()
                }}
              >
                Paste
              </MenuItem>
              <MenuDivider />
              <MenuItem
                icon={<CopyIcon size={16} />}
                onClick={() => {
                  onCopyVisible()
                  close()
                }}
              >
                Copy visible layers
              </MenuItem>
            </>
          )}
        </Dropdown>

        <Dropdown trigger="View" showChevron={false} triggerClassName="menubar-button">
          {(close) => (
            <>
              <MenuSubmenu label="Zoom" icon={<MagnifierIcon size={16} />}>
                {(closeSub) => (
                  <>
                    <MenuItem
                      icon={<ZoomInIcon size={16} />}
                      onClick={() => {
                        onZoomChange(nextZoom(zoom, 1))
                        closeSub()
                        close()
                      }}
                    >
                      Zoom in
                    </MenuItem>
                    <MenuItem
                      icon={<ZoomOutIcon size={16} />}
                      onClick={() => {
                        onZoomChange(nextZoom(zoom, -1))
                        closeSub()
                        close()
                      }}
                    >
                      Zoom out
                    </MenuItem>
                    <MenuItem
                      icon={<MagnifierIcon size={16} />}
                      checked={zoom === 1}
                      onClick={() => {
                        onZoomChange(1)
                        closeSub()
                        close()
                      }}
                    >
                      100%
                    </MenuItem>
                    <MenuItem
                      icon={<ScaleIcon size={16} />}
                      onClick={() => {
                        onZoomFit()
                        closeSub()
                        close()
                      }}
                    >
                      Fit to window
                    </MenuItem>
                  </>
                )}
              </MenuSubmenu>
              <MenuDivider />
              <MenuItem
                icon={<GridIcon size={16} />}
                shortcut="G"
                checked={showGrid}
                onClick={() => {
                  onToggleGrid()
                  close()
                }}
              >
                Pixel grid
              </MenuItem>
              <MenuItem
                icon={<FullscreenIcon size={16} />}
                checked={isFullscreen}
                onClick={() => {
                  onToggleFullscreen()
                  close()
                }}
              >
                Fullscreen
              </MenuItem>
              <MenuItem
                icon={<MiniatureIcon size={16} />}
                checked={showMiniature}
                onClick={() => {
                  onToggleMiniature()
                  close()
                }}
              >
                Miniature view
              </MenuItem>
            </>
          )}
        </Dropdown>

        <div className="menubar-separator" role="separator" />

        <div className="menubar-actions">
          <button
            type="button"
            className="icon-button"
            title="Save (Ctrl+S)"
            aria-label="Save"
            onClick={onSave}
          >
            <SaveIcon size={18} />
          </button>
          <div className="menubar-separator" role="separator" />
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

      {/* The self-hosted build itself does not ship the zip. */}
      {!import.meta.env.VITE_SELF_HOSTED && (
        <a
          className="icon-button static-download"
          href={`${import.meta.env.BASE_URL}farbtopf-static.zip`}
          download="farbtopf-static.zip"
          title="Download for self-hosting"
          aria-label="Download for self-hosting"
        >
          <DownloadIcon size={18} />
        </a>
      )}

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

/** The app icon, which introduces Farbtopf in a small tooltip on hover or keyboard focus. */
function AppLogo() {
  const tooltipId = useId()
  const [open, setOpen] = useState(false)
  return (
    <span
      className="menubar-logo"
      tabIndex={0}
      aria-label="Farbtopf"
      aria-describedby={tooltipId}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} draggable={false} />
      <span id={tooltipId} role="tooltip" className="app-tooltip" hidden={!open}>
        <span className="app-tooltip-title">Farbtopf</span>
        <span className="app-tooltip-text">A tiny paint pot for your browser.</span>
      </span>
    </span>
  )
}
