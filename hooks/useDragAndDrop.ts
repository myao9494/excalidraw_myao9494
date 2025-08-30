import { useEffect, useCallback } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { NonDeletedExcalidrawElement } from '@excalidraw/excalidraw/element/types';

import {
  convertToSceneCoordinates,
  getFileType,
  isFolder,
  createStickyNoteElements,
  createStickyNoteElementsWithFullPath,
  createImageElement,
  resizeImage,
  readFileAsDataURL,
  detectOutlookData,
  extractEmailSubject,
  preventDefaultDragOver,
  preventDefaultDragLeave,
  convertToWebURL,
  type DropResult
} from '../utils/dragDropUtils';

import {
  createEmailStickyNote,
  createEmailStickyNoteWithFullPath,
  saveOutlookEmail,
  uploadEmailFile,
  isEmailFile,
  extractEmailSubjectFromFile
} from '../utils/emailUtils';

export interface UseDragAndDropProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  currentFilePath: string | null;
  containerRef: React.RefObject<HTMLDivElement>;
}

export const useDragAndDrop = ({
  excalidrawAPI,
  currentFilePath,
  containerRef
}: UseDragAndDropProps) => {

  /**
   * 画像ファイルを処理
   */
  const handleImageFile = useCallback(async (
    file: File,
    coordinates: { viewportX: number; viewportY: number }
  ): Promise<DropResult> => {
    try {
      const imageData = await readFileAsDataURL(file);
      
      // 画像の実際のサイズを取得
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageData;
      });

      // アスペクト比を維持してリサイズ
      const { width, height } = resizeImage(img.width, img.height, 400);

      // 画像要素を作成
      const fileId = Math.random().toString(36).substr(2, 9);
      const imageElement = createImageElement(
        coordinates.viewportX,
        coordinates.viewportY,
        width,
        height,
        fileId
      );

      // Excalidrawに画像を追加
      if (excalidrawAPI) {
        excalidrawAPI.addFiles([{ id: fileId, dataURL: imageData }]);
        excalidrawAPI.updateScene({
          elements: [...excalidrawAPI.getSceneElements(), imageElement]
        });
      }

      return { success: true, elements: [imageElement] };
    } catch (error) {
      console.error('Error handling image file:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }, [excalidrawAPI]);

  /**
   * 一般ファイルを処理
   */
  const handleGeneralFile = useCallback(async (
    file: File,
    coordinates: { viewportX: number; viewportY: number }
  ): Promise<DropResult> => {
    try {
      const filePath = currentFilePath || 'localStorage';
      
      if (!currentFilePath) {
        console.warn('No current file path available, using default:', filePath);
      }

      const formData = new FormData();
      formData.append('files', file);
      formData.append('current_path', filePath);

      const response = await fetch(`http://${window.location.hostname}:8008/api/upload-files`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.files && result.files.length > 0) {
        const elements = createStickyNoteElementsWithFullPath(
          coordinates.viewportX,
          coordinates.viewportY,
          file.name,
          result.files[0].path
        );

        if (excalidrawAPI) {
          excalidrawAPI.updateScene({
            elements: [...excalidrawAPI.getSceneElements(), ...elements]
          });
        }

        return { success: true, elements };
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Error handling general file:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }, [excalidrawAPI, currentFilePath]);

  /**
   * メールファイルを処理
   */
  const handleEmailFile = useCallback(async (
    file: File,
    coordinates: { viewportX: number; viewportY: number }
  ): Promise<DropResult> => {
    try {
      const filePath = currentFilePath || 'localStorage';
      
      if (!currentFilePath) {
        console.warn('No current file path available, using default:', filePath);
      }

      const result = await uploadEmailFile(file, filePath);
      
      if (result.success && result.savedPath) {
        const subject = await extractEmailSubjectFromFile(file);
        const elements = createEmailStickyNoteWithFullPath(
          coordinates.viewportX,
          coordinates.viewportY,
          subject || file.name,
          result.savedPath
        );

        if (excalidrawAPI) {
          excalidrawAPI.updateScene({
            elements: [...excalidrawAPI.getSceneElements(), ...elements]
          });
        }

        return { success: true, elements };
      } else {
        throw new Error(result.error || 'Email upload failed');
      }
    } catch (error) {
      console.error('Error handling email file:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }, [excalidrawAPI, currentFilePath]);

  /**
   * フォルダを処理
   */
  const handleFolder = useCallback(async (
    entry: FileSystemDirectoryEntry,
    coordinates: { viewportX: number; viewportY: number }
  ): Promise<DropResult> => {
    try {
      const filePath = currentFilePath || 'localStorage';
      
      if (!currentFilePath) {
        console.warn('No current file path available, using default:', filePath);
      }

      const formData = new FormData();
      formData.append('folder_path', entry.fullPath);
      formData.append('current_path', filePath);

      const response = await fetch(`http://${window.location.hostname}:8008/api/create-folder-shortcut`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        const elements = createStickyNoteElementsWithFullPath(
          coordinates.viewportX,
          coordinates.viewportY,
          entry.name,
          result.folderPath
        );

        if (excalidrawAPI) {
          excalidrawAPI.updateScene({
            elements: [...excalidrawAPI.getSceneElements(), ...elements]
          });
        }

        return { success: true, elements };
      } else {
        throw new Error(result.error || 'Folder shortcut creation failed');
      }
    } catch (error) {
      console.error('Error handling folder:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }, [excalidrawAPI, currentFilePath]);

  /**
   * Outlookメールを処理
   */
  const handleOutlookEmail = useCallback(async (
    dataTransfer: DataTransfer,
    coordinates: { viewportX: number; viewportY: number }
  ): Promise<DropResult> => {
    try {
      const filePath = currentFilePath || 'localStorage';
      
      if (!currentFilePath) {
        console.warn('No current file path available, using default:', filePath);
      }

      const { subject, data } = extractEmailSubject(dataTransfer);
      
      if (!data) {
        throw new Error('No email data found');
      }

      const result = await saveOutlookEmail(data, subject, filePath);
      
      if (result.success && result.savedPath) {
        const elements = createEmailStickyNoteWithFullPath(
          coordinates.viewportX,
          coordinates.viewportY,
          subject,
          result.savedPath
        );

        if (excalidrawAPI) {
          excalidrawAPI.updateScene({
            elements: [...excalidrawAPI.getSceneElements(), ...elements]
          });
        }

        return { success: true, elements };
      } else {
        throw new Error(result.error || 'Outlook email save failed');
      }
    } catch (error) {
      console.error('Error handling Outlook email:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }, [excalidrawAPI, currentFilePath]);

  /**
   * メインのドロップハンドラー
   */
  const handleDrop = useCallback(async (e: DragEvent): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (!excalidrawAPI || !containerRef.current) {
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const appState = excalidrawAPI.getAppState();
    const coordinates = convertToSceneCoordinates(
      e.clientX,
      e.clientY,
      containerRect,
      appState
    );

    const { items, files } = e.dataTransfer!;

    console.log('Drop detected:', {
      items: items.length,
      files: files.length,
      types: e.dataTransfer!.types
    });

    // Outlookメールの検出と処理
    if (detectOutlookData(e.dataTransfer!) && files.length === 0) {
      console.log('Outlook data detected, processing...');
      await handleOutlookEmail(e.dataTransfer!, coordinates);
      return;
    }

    // ファイル/フォルダの処理
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // フォルダの場合
      if (isFolder(item)) {
        const entry = item.webkitGetAsEntry() as FileSystemDirectoryEntry;
        if (entry && entry.isDirectory) {
          await handleFolder(entry, coordinates);
          continue;
        }
      }

      // ファイルの場合
      if (files[i]) {
        const file = files[i];
        const fileType = getFileType(file);

        switch (fileType) {
          case 'image':
            await handleImageFile(file, coordinates);
            break;
          case 'email':
            await handleEmailFile(file, coordinates);
            break;
          case 'general':
            await handleGeneralFile(file, coordinates);
            break;
        }
      }
    }
  }, [
    excalidrawAPI,
    containerRef,
    handleImageFile,
    handleGeneralFile,
    handleEmailFile,
    handleFolder,
    handleOutlookEmail
  ]);

  /**
   * ドラッグ&ドロップイベントリスナーを設定
   */
  useEffect(() => {
    // ドキュメントレベルでイベントをキャプチャ
    document.addEventListener('dragover', preventDefaultDragOver, true);
    document.addEventListener('dragleave', preventDefaultDragLeave, true);
    document.addEventListener('drop', handleDrop, true);

    // コンテナレベルでもイベントをキャプチャ
    const container = containerRef.current;
    if (container) {
      container.addEventListener('dragover', preventDefaultDragOver, true);
      container.addEventListener('dragleave', preventDefaultDragLeave, true);
      container.addEventListener('drop', handleDrop, true);
    }

    return () => {
      document.removeEventListener('dragover', preventDefaultDragOver, true);
      document.removeEventListener('dragleave', preventDefaultDragLeave, true);
      document.removeEventListener('drop', handleDrop, true);

      if (container) {
        container.removeEventListener('dragover', preventDefaultDragOver, true);
        container.removeEventListener('dragleave', preventDefaultDragLeave, true);
        container.removeEventListener('drop', handleDrop, true);
      }
    };
  }, [handleDrop, containerRef]);

  return {
    handleDrop,
    handleImageFile,
    handleGeneralFile,
    handleEmailFile,
    handleFolder,
    handleOutlookEmail
  };
};