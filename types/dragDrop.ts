// ドラッグ&ドロップ関連の型定義

export interface DragDropEventHandlers {
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

export interface FileSystemEntry {
  name: string;
  fullPath: string;
  isFile: boolean;
  isDirectory: boolean;
}

export interface FileSystemFileEntry extends FileSystemEntry {
  isFile: true;
  isDirectory: false;
  file(successCallback: (file: File) => void, errorCallback?: (error: Error) => void): void;
}

export interface FileSystemDirectoryEntry extends FileSystemEntry {
  isFile: false;
  isDirectory: true;
  createReader(): FileSystemDirectoryReader;
}

export interface FileSystemDirectoryReader {
  readEntries(
    successCallback: (entries: FileSystemEntry[]) => void,
    errorCallback?: (error: Error) => void
  ): void;
}

// DataTransferItemのwebkitGetAsEntry拡張
declare global {
  interface DataTransferItem {
    webkitGetAsEntry(): FileSystemEntry | null;
  }
}

export interface UploadResult {
  success: boolean;
  files?: Array<{
    name: string;
    path: string;
    size: number;
  }>;
  error?: string;
}

export interface EmailSaveResult {
  success: boolean;
  savedPath?: string;
  error?: string;
}

export interface FolderShortcutResult {
  success: boolean;
  folderPath?: string;
  error?: string;
}

export interface DropProcessingResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
}

export type FileTypeCategory = 'image' | 'email' | 'general';

export interface ProcessedFile {
  originalFile: File;
  type: FileTypeCategory;
  processed: boolean;
  error?: string;
}

export interface DropZoneState {
  isDragOver: boolean;
  dragDepth: number;
  isProcessing: boolean;
}

export interface ExcalidrawCoordinates {
  clientX: number;
  clientY: number;
  sceneX: number;
  sceneY: number;
  viewportX: number;
  viewportY: number;
}