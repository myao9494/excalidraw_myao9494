import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import { exportToSvg } from "@excalidraw/excalidraw";


export interface ExcalidrawFileData {
  type: string;
  version: number;
  source: string;
  elements: NonDeletedExcalidrawElement[];
  appState: Partial<AppState>;
  files?: any;
}

export const getFilePathFromUrl = (): string | null => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('filepath');
};

const API_BASE_URL = 'http://localhost:8000';

export const loadExcalidrawFile = async (filePath: string): Promise<{ data: ExcalidrawFileData; modified: number } | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/load-file?filepath=${encodeURIComponent(filePath)}`);
    
    if (response.status === 404) {
      // ファイルが存在しない場合はnullを返す
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error loading file:', error);
    return null;
  }
};

export const getFileInfo = async (filePath: string): Promise<{ modified: number; exists: boolean } | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/file-info?filepath=${encodeURIComponent(filePath)}`);
    
    if (response.status === 404) {
      return { modified: 0, exists: false };
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error getting file info:', error);
    return null;
  }
};

export const saveExcalidrawFile = async (filePath: string, data: ExcalidrawFileData): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/save-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filepath: filePath,
        data: data
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('File saved successfully:', result.message);
    return true;
  } catch (error) {
    console.error('Error saving file:', error);
    return false;
  }
};

export const uploadFiles = async (
  files: File[], 
  currentPath: string, 
  fileType: string = 'general'
): Promise<{ success: boolean; files?: Array<{name: string; path: string; size: number}>; error?: string }> => {
  try {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('current_path', currentPath);
    formData.append('file_type', fileType);

    const response = await fetch(`${API_BASE_URL}/api/upload-files`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error uploading files:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export const createFolderShortcut = async (
  folderPath: string,
  currentPath: string
): Promise<{ success: boolean; folderPath?: string; error?: string }> => {
  try {
    const formData = new FormData();
    formData.append('folder_path', folderPath);
    formData.append('current_path', currentPath);

    const response = await fetch(`${API_BASE_URL}/api/create-folder-shortcut`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error creating folder shortcut:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export const saveEmail = async (
  emailData: string,
  subject: string,
  currentPath: string
): Promise<{ success: boolean; savedPath?: string; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/save-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        emailData,
        subject,
        currentPath
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error saving email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * ファイルパスがExcalidrawファイルかどうかを判定
 */
export const isExcalidrawFile = (filePath: string): boolean => {
  if (!filePath) return false;
  const extension = filePath.toLowerCase().split('.').pop();
  return extension === 'excalidraw';
};

/**
 * 付箋のリンククリック処理
 * Excalidrawファイル以外は外部ファイルビューアーにリダイレクト
 */
export const handleStickyNoteLink = (linkUrl: string): void => {
  try {
    // URLの場合はそのまま開く
    if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
      window.open(linkUrl, '_blank');
      return;
    }

    // ファイルパスの場合
    if (isExcalidrawFile(linkUrl)) {
      // Excalidrawファイルの場合は現在のアプリで開く
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('filepath', linkUrl);
      window.location.href = currentUrl.toString();
    } else {
      // Excalidraw以外のファイルは外部ファイルビューアーの/fullpathエンドポイントで開く
      // URLエンコードせずに、クエリパラメータとして直接渡す
      const fileViewerUrl = `http://localhost:5001/fullpath?path=${linkUrl}`;
      window.open(fileViewerUrl, '_blank');
    }
  } catch (error) {
    console.error('Error handling sticky note link:', error);
    // エラーの場合は元のリンクをそのまま開く
    window.open(linkUrl, '_blank');
  }
};

/**
 * SVGファイルとして保存する関数
 * @param elements 選択された要素または全要素
 * @param appState アプリケーションの状態
 * @param files ファイルデータ
 * @param currentFolder 現在のフォルダパス
 * @param selectedElements 選択された要素（nullの場合は全要素）
 */
export const exportToSvgFile = async (
  elements: NonDeletedExcalidrawElement[],
  appState: AppState,
  files: any,
  currentFolder: string | null,
  selectedElements: NonDeletedExcalidrawElement[] | null = null
): Promise<boolean> => {
  try {
    // ファイル名を入力させる
    const fileName = prompt('SVGファイル名を入力してください（拡張子なし）:');
    if (!fileName || !fileName.trim()) {
      return false;
    }

    // 選択された要素がある場合はそれを使用、なければ全要素を使用
    let elementsToExport = selectedElements && selectedElements.length > 0 ? selectedElements : elements;
    
    // 付箋のテキストが含まれるように、containerIdを持つテキスト要素も含める
    if (selectedElements && selectedElements.length > 0) {
      const selectedIds = new Set(selectedElements.map(el => el.id));
      const relatedTextElements = elements.filter(element => 
        element.type === 'text' && 
        element.containerId && 
        selectedIds.has(element.containerId)
      );
      
      // 関連するテキスト要素を追加
      elementsToExport = [...selectedElements, ...relatedTextElements.filter(textEl => 
        !selectedIds.has(textEl.id)
      )];
      
      console.log('Added related text elements:', relatedTextElements.length);
    }

    // SVGを生成（改善版）
    const svg = await exportToSvg({
      elements: elementsToExport,
      appState: {
        ...appState,
        exportBackground: true,
        exportWithDarkMode: false,
        exportEmbedScene: false,
        // フォント関連の設定を保持
        currentItemFontFamily: appState.currentItemFontFamily || 1, // デフォルトフォント
        currentItemFontSize: appState.currentItemFontSize || 20,
        // テキストの可視性を確保
        currentItemStrokeColor: appState.currentItemStrokeColor || '#000000',
        currentItemOpacity: appState.currentItemOpacity || 100,
      },
      files,
      exportPadding: 10,
      metadata: "" // 必要に応じてメタデータを追加
    });

    // SVGをテキストとして取得
    const svgString = new XMLSerializer().serializeToString(svg);
    
    // デバッグ用：SVG内容を確認
    console.log('Generated SVG contains font data:', svgString.includes('@font-face'));
    console.log('Text elements count:', elementsToExport.filter(e => e.type === 'text').length);
    console.log('Elements to export:', elementsToExport.length);

    // ファイルパスを構築
    const normalizedFolder = currentFolder ? currentFolder.replace(/\\/g, '/') : '.';
    const filePath = `${normalizedFolder}/${fileName.trim()}.svg`;

    // バックエンドに保存
    const response = await fetch(`${API_BASE_URL}/api/save-svg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filepath: filePath,
        svg_content: svgString
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('SVG file saved successfully:', result.message);
    return true;
  } catch (error) {
    console.error('Error saving SVG file:', error);
    return false;
  }
};