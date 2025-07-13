import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export interface DropCoordinates {
  x: number;
  y: number;
  viewportX: number;
  viewportY: number;
}

export interface FileDropItem {
  file: File;
  type: 'image' | 'email' | 'general';
}

export interface FolderDropItem {
  entry: FileSystemDirectoryEntry;
  name: string;
}

export interface DropResult {
  success: boolean;
  elements?: NonDeletedExcalidrawElement[];
  error?: string;
}

/**
 * ドロップ座標をExcalidrawのシーン座標に変換
 */
export const convertToSceneCoordinates = (
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  appState: { zoom: { value: number }; scrollX: number; scrollY: number }
): DropCoordinates => {
  const x = clientX - containerRect.left;
  const y = clientY - containerRect.top;
  
  const viewportX = (appState.scrollX * -1) + x / appState.zoom.value;
  const viewportY = (appState.scrollY * -1) + y / appState.zoom.value;
  
  return { x, y, viewportX, viewportY };
};

/**
 * ファイルの種類を判定
 */
export const getFileType = (file: File): 'image' | 'email' | 'general' => {
  if (file.type.startsWith('image/')) {
    return 'image';
  }
  
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.eml') || fileName.endsWith('.msg')) {
    return 'email';
  }
  
  return 'general';
};

/**
 * フォルダかどうかを判定
 */
export const isFolder = (item: DataTransferItem): boolean => {
  if (item.kind === 'file') {
    const entry = item.webkitGetAsEntry();
    return entry && entry.isDirectory;
  }
  return false;
};

/**
 * ローカルファイルパスをWebURLに変換
 */
export const convertToWebURL = (filePath: string): string => {
  // uploads または upload_local ディレクトリ以降のパスを抽出
  const uploadsIndex = filePath.indexOf('uploads');
  const uploadLocalIndex = filePath.indexOf('upload_local');
  
  if (uploadsIndex !== -1) {
    const relativePath = filePath.substring(uploadsIndex);
    return `http://localhost:8000/api/file/${relativePath}`;
  } else if (uploadLocalIndex !== -1) {
    const relativePath = filePath.substring(uploadLocalIndex);
    return `http://localhost:8000/api/file/${relativePath}`;
  } else {
    return filePath; // uploads/upload_local が含まれていない場合はそのまま返す
  }
};

/**
 * ファイルのフルパス情報を含む付箋要素を作成
 */
export const createStickyNoteElementsWithFullPath = (
  x: number,
  y: number,
  text: string,
  fullPath: string,
  backgroundColor: string = '#fef3bd',
  strokeColor: string = '#000000'
): NonDeletedExcalidrawElement[] => {
  const rectangleId = Math.random().toString(36).substr(2, 9);
  const textId = "text-" + Math.random().toString(36).substr(2, 9);

  return [
    {
      id: rectangleId,
      type: 'rectangle',
      x: x - 100,
      y: y - 25,
      width: 200,
      height: 50,
      angle: 0,
      strokeColor,
      backgroundColor,
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: 'a0',
      roundness: { type: 1, value: 0 },
      seed: Math.floor(Math.random() * 1000000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      boundElements: [{ type: "text", id: textId }],
      updated: Date.now(),
      link: fullPath,
      locked: false,
    } as NonDeletedExcalidrawElement,
    {
      id: textId,
      type: 'text',
      x: x - 90,
      y: y - 15,
      width: 180,
      height: 30,
      angle: 0,
      strokeColor,
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: 'a1',
      roundness: null,
      seed: Math.floor(Math.random() * 1000000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      text: text.length > 25 ? text.substring(0, 22) + '...' : text,
      fontSize: 20,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      baseline: 12,
      containerId: rectangleId,
      originalText: text,
      lineHeight: 1.1,
      boundElements: [],
      updated: Date.now(),
      link: fullPath,
      locked: false,
    } as NonDeletedExcalidrawElement
  ];
};

/**
 * 基本的な付箋要素を作成
 */
export const createStickyNoteElements = (
  x: number,
  y: number,
  text: string,
  link?: string,
  backgroundColor: string = '#fef3bd',
  strokeColor: string = '#000000'
): NonDeletedExcalidrawElement[] => {
  const rectangleId = Math.random().toString(36).substr(2, 9);
  const textId = "text-" + Math.random().toString(36).substr(2, 9);

  return [
    {
      id: rectangleId,
      type: 'rectangle',
      x: x - 100,
      y: y - 25,
      width: 200,
      height: 50,
      angle: 0,
      strokeColor,
      backgroundColor,
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: 'a0',
      roundness: { type: 1, value: 0 },
      seed: Math.floor(Math.random() * 1000000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      boundElements: [{ type: "text", id: textId }],
      updated: Date.now(),
      link: link || null,
      locked: false,
    } as NonDeletedExcalidrawElement,
    {
      id: textId,
      type: 'text',
      x: x - 90,
      y: y - 15,
      width: 180,
      height: 30,
      angle: 0,
      strokeColor,
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: 'a1',
      roundness: null,
      seed: Math.floor(Math.random() * 1000000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      text: text.length > 25 ? text.substring(0, 22) + '...' : text,
      fontSize: 20,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      baseline: 12,
      containerId: rectangleId,
      originalText: text,
      lineHeight: 1.1,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
    } as NonDeletedExcalidrawElement
  ];
};

/**
 * 画像要素を作成
 */
export const createImageElement = (
  x: number,
  y: number,
  width: number,
  height: number,
  fileId: string
): NonDeletedExcalidrawElement => {
  return {
    id: Math.random().toString(36).substr(2, 9),
    type: "image",
    x: x - width / 2,
    y: y - height / 2,
    width,
    height,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: 'a0',
    roundness: null,
    seed: Math.floor(Math.random() * 1000000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 1000000),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    fileId,
    scale: [1, 1] as [number, number],
  } as NonDeletedExcalidrawElement;
};

/**
 * 画像のサイズを最大値に基づいてリサイズ
 */
export const resizeImage = (
  originalWidth: number,
  originalHeight: number,
  maxSize: number = 400
): { width: number; height: number } => {
  let width = originalWidth;
  let height = originalHeight;

  // アスペクト比を維持してリサイズ
  if (width > height) {
    if (width > maxSize) {
      height = (height * maxSize) / width;
      width = maxSize;
    }
  } else {
    if (height > maxSize) {
      width = (width * maxSize) / height;
      height = maxSize;
    }
  }

  return { width, height };
};

/**
 * ファイルをData URLとして読み込み
 */
export const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Outlookメールデータを検出
 */
export const detectOutlookData = (dataTransfer: DataTransfer): boolean => {
  return dataTransfer.types.includes('text/x-moz-url') || 
         dataTransfer.types.includes('application/x-moz-file') ||
         dataTransfer.types.includes('Files') ||
         dataTransfer.types.includes('text/x-moz-message') ||
         dataTransfer.types.includes('application/x-moz-nativehtml') ||
         dataTransfer.types.includes('text/x-moz-text-internal') ||
         dataTransfer.types.includes('text/x-moz-place') ||
         dataTransfer.types.includes('application/x-moz-drag-image') ||
         dataTransfer.types.includes('text/rtf') ||
         dataTransfer.types.includes('application/rtf') ||
         dataTransfer.types.includes('text/x-moz-text-plain') ||
         (dataTransfer.types.includes('text/plain') && dataTransfer.files.length === 0) ||
         (dataTransfer.types.includes('text/html') && dataTransfer.files.length === 0) ||
         (dataTransfer.effectAllowed === 'all' && dataTransfer.files.length === 0);
};

/**
 * メールデータから件名を抽出
 */
export const extractEmailSubject = (dataTransfer: DataTransfer): { subject: string; data: string } => {
  let subject = 'Outlook Email';
  let emailData = '';

  // 様々な形式でデータを取得
  for (const type of dataTransfer.types) {
    try {
      const data = dataTransfer.getData(type);
      if (!data) continue;

      emailData = data;

      if (type === 'text/plain' && data) {
        const lines = data.split('\n');
        if (lines.length > 0) {
          subject = lines[0].trim() || 'Outlook Email';
        }
      } else if (type === 'text/x-moz-url' && data) {
        const urlParts = data.split('\n');
        if (urlParts.length > 1) {
          subject = urlParts[1] || 'Outlook Email';
        }
      } else if (type === 'text/html' && data) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = data;
        const textContent = tempDiv.textContent || tempDiv.innerText || '';
        const lines = textContent.split('\n');
        if (lines.length > 0) {
          subject = lines[0].trim() || 'Outlook Email';
        }
      }
    } catch (error) {
      console.warn(`Failed to get data for type ${type}:`, error);
    }
  }

  return { subject, data: emailData };
};

/**
 * ドラッグオーバーイベントを防止
 */
export const preventDefaultDragOver = (e: DragEvent): void => {
  e.preventDefault();
  e.stopPropagation();
  
  // ドロップ効果を設定
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
};

/**
 * ドラッグリーブイベントを防止
 */
export const preventDefaultDragLeave = (e: DragEvent): void => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
};