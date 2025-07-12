import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";


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