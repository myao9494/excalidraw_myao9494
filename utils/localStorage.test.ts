import { describe, it, expect, beforeEach } from 'vitest';
import { 
  saveElementsToLocalStorage, 
  loadElementsFromLocalStorage, 
  saveAppStateToLocalStorage, 
  loadAppStateFromLocalStorage,
  saveBinaryFilesToLocalStorage,
  loadBinaryFilesFromLocalStorage,
  clearLocalStorage
} from './localStorage';
import { ExcalidrawElement, AppState, BinaryFiles } from '@excalidraw/excalidraw/types';

// モックのlocalStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

describe('LocalStorage utils', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  describe('saveElementsToLocalStorage', () => {
    it('should save elements to localStorage', () => {
      const elements: ExcalidrawElement[] = [
        {
          id: 'test-id-1',
          type: 'rectangle',
          x: 100,
          y: 200,
          width: 150,
          height: 100,
          angle: 0,
          strokeColor: '#000000',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roundness: null,
          roughness: 1,
          opacity: 100,
          isDeleted: false,
          groupIds: [],
          frameId: null,
          index: 'a0',
          seed: 1234567890,
          versionNonce: 123456789,
          updated: 1,
          link: null,
          locked: false,
          customData: null
        }
      ];

      saveElementsToLocalStorage(elements);
      
      const savedData = mockLocalStorage.getItem('excalidraw-elements');
      expect(savedData).toBeDefined();
      expect(JSON.parse(savedData!)).toEqual(elements);
    });

    it('should handle empty elements array', () => {
      const elements: ExcalidrawElement[] = [];
      
      saveElementsToLocalStorage(elements);
      
      const savedData = mockLocalStorage.getItem('excalidraw-elements');
      expect(savedData).toBeDefined();
      expect(JSON.parse(savedData!)).toEqual([]);
    });
  });

  describe('loadElementsFromLocalStorage', () => {
    it('should load elements from localStorage', () => {
      const elements: ExcalidrawElement[] = [
        {
          id: 'test-id-1',
          type: 'rectangle',
          x: 100,
          y: 200,
          width: 150,
          height: 100,
          angle: 0,
          strokeColor: '#000000',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roundness: null,
          roughness: 1,
          opacity: 100,
          isDeleted: false,
          groupIds: [],
          frameId: null,
          index: 'a0',
          seed: 1234567890,
          versionNonce: 123456789,
          updated: 1,
          link: null,
          locked: false,
          customData: null
        }
      ];

      mockLocalStorage.setItem('excalidraw-elements', JSON.stringify(elements));
      
      const loadedElements = loadElementsFromLocalStorage();
      expect(loadedElements).toEqual(elements);
    });

    it('should return empty array when no data exists', () => {
      const loadedElements = loadElementsFromLocalStorage();
      expect(loadedElements).toEqual([]);
    });

    it('should return empty array when localStorage data is corrupted', () => {
      mockLocalStorage.setItem('excalidraw-elements', 'corrupted-json');
      
      const loadedElements = loadElementsFromLocalStorage();
      expect(loadedElements).toEqual([]);
    });
  });

  describe('saveAppStateToLocalStorage', () => {
    it('should save app state to localStorage', () => {
      const appState: Partial<AppState> = {
        viewBackgroundColor: '#ffffff',
        currentItemFontFamily: 1,
        currentItemFontSize: 16,
        currentItemStrokeColor: '#000000',
        currentItemBackgroundColor: 'transparent',
        currentItemFillStyle: 'solid',
        currentItemStrokeWidth: 2,
        currentItemStrokeStyle: 'solid',
        currentItemRoughness: 1,
        currentItemOpacity: 100,
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0
      };

      saveAppStateToLocalStorage(appState);
      
      const savedData = mockLocalStorage.getItem('excalidraw-app-state');
      expect(savedData).toBeDefined();
      expect(JSON.parse(savedData!)).toEqual(appState);
    });
  });

  describe('loadAppStateFromLocalStorage', () => {
    it('should load app state from localStorage', () => {
      const appState: Partial<AppState> = {
        viewBackgroundColor: '#ffffff',
        currentItemFontFamily: 1,
        currentItemFontSize: 16,
        currentItemStrokeColor: '#000000',
        currentItemBackgroundColor: 'transparent',
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0
      };

      mockLocalStorage.setItem('excalidraw-app-state', JSON.stringify(appState));
      
      const loadedAppState = loadAppStateFromLocalStorage();
      expect(loadedAppState).toEqual(appState);
    });

    it('should return null when no data exists', () => {
      const loadedAppState = loadAppStateFromLocalStorage();
      expect(loadedAppState).toBeNull();
    });

    it('should return null when localStorage data is corrupted', () => {
      mockLocalStorage.setItem('excalidraw-app-state', 'corrupted-json');
      
      const loadedAppState = loadAppStateFromLocalStorage();
      expect(loadedAppState).toBeNull();
    });
  });

  describe('saveBinaryFilesToLocalStorage', () => {
    it('should save binary files to localStorage', () => {
      const binaryFiles: BinaryFiles = {
        'test-file-id': {
          id: 'test-file-id',
          mimeType: 'image/png',
          dataURL: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          created: Date.now(),
        }
      };

      saveBinaryFilesToLocalStorage(binaryFiles);
      
      const savedData = mockLocalStorage.getItem('excalidraw-binary-files');
      expect(savedData).toBeDefined();
      expect(JSON.parse(savedData!)).toEqual(binaryFiles);
    });

    it('should handle empty binary files', () => {
      const binaryFiles: BinaryFiles = {};
      
      saveBinaryFilesToLocalStorage(binaryFiles);
      
      const savedData = mockLocalStorage.getItem('excalidraw-binary-files');
      expect(savedData).toBeDefined();
      expect(JSON.parse(savedData!)).toEqual({});
    });
  });

  describe('loadBinaryFilesFromLocalStorage', () => {
    it('should load binary files from localStorage', () => {
      const binaryFiles: BinaryFiles = {
        'test-file-id': {
          id: 'test-file-id',
          mimeType: 'image/png',
          dataURL: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          created: Date.now(),
        }
      };

      mockLocalStorage.setItem('excalidraw-binary-files', JSON.stringify(binaryFiles));
      
      const loadedFiles = loadBinaryFilesFromLocalStorage();
      expect(loadedFiles).toEqual(binaryFiles);
    });

    it('should return empty object when no data exists', () => {
      const loadedFiles = loadBinaryFilesFromLocalStorage();
      expect(loadedFiles).toEqual({});
    });

    it('should return empty object when localStorage data is corrupted', () => {
      mockLocalStorage.setItem('excalidraw-binary-files', 'corrupted-json');
      
      const loadedFiles = loadBinaryFilesFromLocalStorage();
      expect(loadedFiles).toEqual({});
    });
  });

  describe('clearLocalStorage', () => {
    it('should clear all excalidraw data from localStorage', () => {
      mockLocalStorage.setItem('excalidraw-elements', '[]');
      mockLocalStorage.setItem('excalidraw-app-state', '{}');
      mockLocalStorage.setItem('excalidraw-binary-files', '{}');
      mockLocalStorage.setItem('other-data', 'should-remain');

      clearLocalStorage();

      expect(mockLocalStorage.getItem('excalidraw-elements')).toBeNull();
      expect(mockLocalStorage.getItem('excalidraw-app-state')).toBeNull();
      expect(mockLocalStorage.getItem('excalidraw-binary-files')).toBeNull();
      expect(mockLocalStorage.getItem('other-data')).toBe('should-remain');
    });
  });
});