import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";


export interface ExcalidrawFileData {
  elements: NonDeletedExcalidrawElement[];
  appState: Partial<AppState>;
  files?: any;
}

export const getFilePathFromUrl = (): string | null => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('filepath');
};

const API_BASE_URL = 'http://localhost:8000';

export const loadExcalidrawFile = async (filePath: string): Promise<ExcalidrawFileData | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/load-file?filepath=${encodeURIComponent(filePath)}`);
    
    if (response.status === 404) {
      // ファイルが存在しない場合はnullを返す
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading file:', error);
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