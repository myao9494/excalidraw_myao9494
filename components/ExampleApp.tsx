import React, {
  useEffect,
  useState,
  useRef,
  Children,
  cloneElement,
  useCallback,
} from "react";

import type * as TExcalidraw from "@excalidraw/excalidraw";
import type {
  NonDeletedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";

import initialData from "../initialData";
import { resolvablePromise } from "../utils";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { 
  saveElementsToLocalStorage, 
  loadElementsFromLocalStorage, 
  saveAppStateToLocalStorage, 
  loadAppStateFromLocalStorage,
  saveBinaryFilesToLocalStorage,
  loadBinaryFilesFromLocalStorage
} from "../utils/localStorage";
import { 
  getFilePathFromUrl, 
  loadExcalidrawFile, 
  saveExcalidrawFile,
  getFileInfo,
  handleStickyNoteLink,
  type ExcalidrawFileData
} from "../utils/fileUtils";

import "./ExampleApp.scss";

import type { ResolvablePromise } from "../utils";

export interface AppProps {
  appTitle: string;
  useCustom: (api: ExcalidrawImperativeAPI | null, customArgs?: any[]) => void;
  customArgs?: any[];
  children: React.ReactNode;
  excalidrawLib: typeof TExcalidraw;
}

export default function ExampleApp({
  appTitle,
  useCustom,
  customArgs,
  children,
  excalidrawLib,
}: AppProps) {
  const {
    convertToExcalidrawElements,
    viewportCoordsToSceneCoords,
  } = excalidrawLib;
  
  const appRef = useRef<any>(null);

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [lastSavedElements, setLastSavedElements] = useState<string>('');
  const [lastFileModified, setLastFileModified] = useState<number>(0);
  
  // デバウンス処理用のstate（削除済み - Refを使用）
  
  // 最新の値を保持するためのref
  const currentFilePathRef = useRef<string | null>(null);
  const lastSavedElementsRef = useRef<string>('');
  
  // refの値を更新
  useEffect(() => {
    currentFilePathRef.current = currentFilePath;
  }, [currentFilePath]);
  
  useEffect(() => {
    lastSavedElementsRef.current = lastSavedElements;
  }, [lastSavedElements]);
  
  // ドラッグ&ドロップ用のコンテナRef
  const containerRef = useRef<HTMLDivElement>(null);

  useCustom(excalidrawAPI, customArgs);

  // カスタムキーボードショートカット機能を追加
  useKeyboardShortcuts({
    excalidrawAPI,
    viewportCoordsToSceneCoords,
  });

  // ドラッグ&ドロップ機能を追加
  useDragAndDrop({
    excalidrawAPI,
    currentFilePath,
    containerRef,
  });

  useEffect(() => {
    const filePath = getFilePathFromUrl();
    
    // URLパラメータでファイルパスが指定されている場合の処理
    if (filePath) {
      // Excalidrawファイル以外の場合はfile viewerにリダイレクト
      if (!filePath.toLowerCase().endsWith('.excalidraw')) {
        const fileViewerUrl = `http://localhost:5001/fullpath?path=${filePath}`;
        window.location.href = fileViewerUrl;
        return;
      }
    }
    
    setCurrentFilePath(filePath);
  }, []);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    
    const loadData = async () => {
      let dataToLoad;
      
      if (currentFilePath) {
        // ファイルパスが指定されている場合はファイルから読み込み
        const fileResult = await loadExcalidrawFile(currentFilePath);
        if (fileResult) {
          const { data: fileData, modified } = fileResult;
          dataToLoad = {
            ...initialData,
            elements: fileData.elements.length > 0 ? fileData.elements : convertToExcalidrawElements(initialData.elements),
            appState: fileData.appState ? { ...initialData.appState, ...fileData.appState } : initialData.appState,
            files: fileData.files || {},
          };
          
          // ファイルの更新日時を記録
          setLastFileModified(modified);
          // 初期読み込み時の要素を記録
          setLastSavedElements(JSON.stringify(fileData.elements));
        } else {
          // ファイルが存在しない場合は初期データを使用
          dataToLoad = {
            ...initialData,
            elements: convertToExcalidrawElements(initialData.elements),
            appState: initialData.appState,
            files: {},
          };
          setLastSavedElements(JSON.stringify([]));
        }
      } else {
        // ローカルストレージからデータを読み込み
        const savedElements = loadElementsFromLocalStorage();
        const savedAppState = loadAppStateFromLocalStorage();
        const savedFiles = loadBinaryFilesFromLocalStorage();
        
        dataToLoad = {
          ...initialData,
          elements: savedElements.length > 0 ? savedElements : convertToExcalidrawElements(initialData.elements),
          appState: savedAppState ? { ...initialData.appState, ...savedAppState } : initialData.appState,
          files: savedFiles,
        };
      }
      
      //@ts-ignore
      initialStatePromiseRef.current.promise.resolve(dataToLoad);
    };
    
    loadData();
  }, [excalidrawAPI, convertToExcalidrawElements, currentFilePath]);

  // 定期的にファイルの更新日時をチェック
  useEffect(() => {
    if (!currentFilePath || !excalidrawAPI) {
      return;
    }

    const checkFileUpdates = async () => {
      try {
        const fileInfo = await getFileInfo(currentFilePath);
        if (fileInfo && fileInfo.exists && fileInfo.modified > lastFileModified) {
          console.log('File was updated externally, reloading...');
          
          // ファイルを再読み込み
          const fileResult = await loadExcalidrawFile(currentFilePath);
          if (fileResult) {
            const { data: fileData, modified } = fileResult;
            
            // Excalidraw APIを使用してシーンを更新
            const newElements = fileData.elements.length > 0 ? fileData.elements : [];
            const newAppState = fileData.appState ? { ...fileData.appState } : {};
            const newFiles = fileData.files || {};
            
            excalidrawAPI.updateScene({
              elements: newElements,
              appState: newAppState,
              files: newFiles,
            });
            
            // 状態を更新
            setLastFileModified(modified);
            setLastSavedElements(JSON.stringify(fileData.elements));
          }
        }
      } catch (error) {
        console.error('Error checking file updates:', error);
      }
    };

    // 5秒ごとにファイルの更新をチェック
    const interval = setInterval(checkFileUpdates, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [currentFilePath, excalidrawAPI, lastFileModified]);

  // 最新値を保持するRef
  const lastSaveTimeRef = useRef<number>(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 変更検知用のRef
  const lastChangeTimeRef = useRef<number>(0);
  const pendingSaveRef = useRef<boolean>(false);

  // 効率的な変更検知関数
  const isSignificantChange = useCallback((elements: NonDeletedExcalidrawElement[]): boolean => {
    const currentFilePathValue = currentFilePathRef.current;
    if (!currentFilePathValue) return true; // ローカルストレージの場合は常に保存

    // 要素数が変わった場合は重要な変更
    const currentSummary = {
      count: elements.length,
      ids: elements.map(el => el.id).sort().join(','),
      // 1px単位で変更を検知
      positions: elements.map(el => `${el.id}:${Math.round(el.x)},${Math.round(el.y)}`).sort().join('|')
    };
    
    const currentSummaryString = JSON.stringify(currentSummary);
    const hasChanged = currentSummaryString !== lastSavedElementsRef.current;
    
    return hasChanged;
  }, []);

  // デバウンス処理を行う保存関数
  const debouncedSave = useCallback((
    elements: NonDeletedExcalidrawElement[],
    appState: any,
    files: any
  ) => {
    // 重要な変更かどうかをチェック
    if (!isSignificantChange(elements)) {
      return; // 重要でない変更はスキップ
    }

    // 既存のタイマーをクリア
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // 保存待機中でない場合のみログ出力
    if (!pendingSaveRef.current) {
      console.log(`[Debounce] Scheduling save (elements: ${elements.length})`);
      pendingSaveRef.current = true;
    }

    const now = Date.now();
    lastChangeTimeRef.current = now;

    // 0.5秒のデバウンス処理
    saveTimeoutRef.current = setTimeout(() => {
      // 最後の変更から0.5秒経過していることを確認
      if (now === lastChangeTimeRef.current || Date.now() - lastChangeTimeRef.current >= 400) {
        performSave(elements, appState, files);
        pendingSaveRef.current = false;
      }
      saveTimeoutRef.current = null;
    }, 500);
  }, [isSignificantChange]);

  // 実際の保存処理を実行する関数
  const performSave = useCallback((
    elements: NonDeletedExcalidrawElement[],
    appState: any,
    files: any
  ) => {
    const now = Date.now();
    
    // 保存したいアプリケーション状態のみを抽出
    const stateToSave = {
      viewBackgroundColor: appState.viewBackgroundColor,
      currentItemFontFamily: appState.currentItemFontFamily,
      currentItemFontSize: appState.currentItemFontSize,
      currentItemStrokeColor: appState.currentItemStrokeColor,
      currentItemBackgroundColor: appState.currentItemBackgroundColor,
      currentItemFillStyle: appState.currentItemFillStyle,
      currentItemStrokeWidth: appState.currentItemStrokeWidth,
      currentItemStrokeStyle: appState.currentItemStrokeStyle,
      currentItemRoughness: appState.currentItemRoughness,
      currentItemOpacity: appState.currentItemOpacity,
      zoom: appState.zoom,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
    };

    const currentFilePathValue = currentFilePathRef.current;
    if (currentFilePathValue) {
      // サマリーベースの変更検知を使用
      const currentSummary = {
        count: elements.length,
        ids: elements.map(el => el.id).sort().join(','),
        positions: elements.map(el => `${el.id}:${Math.round(el.x)},${Math.round(el.y)}`).sort().join('|')
      };
      const currentSummaryString = JSON.stringify(currentSummary);
      
      if (currentSummaryString !== lastSavedElementsRef.current) {
        // ファイルパスが指定されている場合はファイルに保存
        const fileData: ExcalidrawFileData = {
          type: "excalidraw",
          version: 2,
          source: "https://excalidraw.com",
          elements,
          appState: stateToSave,
          files: files || {}
        };
        
        saveExcalidrawFile(currentFilePathValue, fileData).then(success => {
          if (success) {
            console.log(`[Save] File saved successfully (${elements.length} elements)`);
            setLastSavedElements(currentSummaryString);
            lastSavedElementsRef.current = currentSummaryString;
            setLastFileModified(now);
            lastSaveTimeRef.current = now;
          } else {
            console.error(`Failed to save file: ${currentFilePathValue}`);
          }
        });
      }
    } else {
      // ローカルストレージに保存
      saveElementsToLocalStorage(elements);
      
      // 画像データも保存
      if (files) {
        saveBinaryFilesToLocalStorage(files);
      }
      
      // アプリケーション状態も保存
      saveAppStateToLocalStorage(stateToSave);
      
      lastSaveTimeRef.current = now;
    }
  }, []);

  // コンポーネントのクリーンアップ時にタイマーをクリア
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  const renderExcalidraw = (children: React.ReactNode) => {
    const Excalidraw: any = Children.toArray(children).find(
      (child) =>
        React.isValidElement(child) &&
        typeof child.type !== "string" &&
        //@ts-ignore
        child.type.displayName === "Excalidraw",
    );
    if (!Excalidraw) {
      return;
    }
    const newElement = cloneElement(
      Excalidraw,
      {
        excalidrawAPI: (api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api),
        initialData: initialStatePromiseRef.current.promise,
        onChange: (
          elements: NonDeletedExcalidrawElement[],
          state: AppState,
          files: any,
        ) => {
          // デバウンス処理を使用して保存
          debouncedSave(elements, state, files);
        },
        onLinkOpen: (element: NonDeletedExcalidrawElement, event: PointerEvent) => {
          // 付箋のリンククリック処理をカスタマイズ
          if (element.link) {
            event.preventDefault();
            handleStickyNoteLink(element.link);
          }
        },
      },
    );
    return newElement;
  };

  return (
    <div className="App" ref={appRef}>
      <div className="excalidraw-wrapper" ref={containerRef}>
        {renderExcalidraw(children)}
      </div>
    </div>
  );
}