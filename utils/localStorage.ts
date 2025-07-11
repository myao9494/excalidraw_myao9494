import { ExcalidrawElement, AppState, BinaryFiles } from '@excalidraw/excalidraw/types';

const ELEMENTS_KEY = 'excalidraw-elements';
const APP_STATE_KEY = 'excalidraw-app-state';
const BINARY_FILES_KEY = 'excalidraw-binary-files';

export const saveElementsToLocalStorage = (elements: ExcalidrawElement[]): void => {
  try {
    const serializedElements = JSON.stringify(elements);
    localStorage.setItem(ELEMENTS_KEY, serializedElements);
  } catch (error) {
    console.error('Failed to save elements to localStorage:', error);
  }
};

export const loadElementsFromLocalStorage = (): ExcalidrawElement[] => {
  try {
    const serializedElements = localStorage.getItem(ELEMENTS_KEY);
    if (!serializedElements) {
      return [];
    }
    return JSON.parse(serializedElements);
  } catch (error) {
    console.error('Failed to load elements from localStorage:', error);
    return [];
  }
};

export const saveAppStateToLocalStorage = (appState: Partial<AppState>): void => {
  try {
    const serializedAppState = JSON.stringify(appState);
    localStorage.setItem(APP_STATE_KEY, serializedAppState);
  } catch (error) {
    console.error('Failed to save app state to localStorage:', error);
  }
};

export const loadAppStateFromLocalStorage = (): Partial<AppState> | null => {
  try {
    const serializedAppState = localStorage.getItem(APP_STATE_KEY);
    if (!serializedAppState) {
      return null;
    }
    return JSON.parse(serializedAppState);
  } catch (error) {
    console.error('Failed to load app state from localStorage:', error);
    return null;
  }
};

export const saveBinaryFilesToLocalStorage = (files: BinaryFiles): void => {
  try {
    const serializedFiles = JSON.stringify(files);
    localStorage.setItem(BINARY_FILES_KEY, serializedFiles);
  } catch (error) {
    console.error('Failed to save binary files to localStorage:', error);
  }
};

export const loadBinaryFilesFromLocalStorage = (): BinaryFiles => {
  try {
    const serializedFiles = localStorage.getItem(BINARY_FILES_KEY);
    if (!serializedFiles) {
      return {};
    }
    return JSON.parse(serializedFiles);
  } catch (error) {
    console.error('Failed to load binary files from localStorage:', error);
    return {};
  }
};

export const clearLocalStorage = (): void => {
  try {
    localStorage.removeItem(ELEMENTS_KEY);
    localStorage.removeItem(APP_STATE_KEY);
    localStorage.removeItem(BINARY_FILES_KEY);
  } catch (error) {
    console.error('Failed to clear localStorage:', error);
  }
};