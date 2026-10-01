// Parts of the File System Access API that lib.dom does not type yet
// (Chromium-only: https://wicg.github.io/file-system-access/).

export {}

declare global {
  interface FilePickerAcceptType {
    description?: string
    accept: Record<string, string[]>
  }

  interface FilePickerOptions {
    types?: FilePickerAcceptType[]
    excludeAcceptAllOption?: boolean
    id?: string
  }

  interface OpenFilePickerOptions extends FilePickerOptions {
    multiple?: boolean
  }

  interface SaveFilePickerOptions extends FilePickerOptions {
    suggestedName?: string
  }

  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite'
  }

  interface FileSystemHandle {
    queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  }

  interface Window {
    showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
    showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
  }

  interface DataTransferItem {
    getAsFileSystemHandle?(): Promise<FileSystemHandle | null>
  }
}
