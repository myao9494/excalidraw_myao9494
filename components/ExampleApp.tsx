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

  useCustom(excalidrawAPI, customArgs);

  // カスタムキーボードショートカット機能を追加
  useKeyboardShortcuts({
    excalidrawAPI,
    viewportCoordsToSceneCoords,
  });

  useEffect(() => {
    const filePath = getFilePathFromUrl();
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
          console.info("Elements :", elements, "State : ", state, "Files:", files);
          
          // 保存したいアプリケーション状態のみを抽出
          const stateToSave = {
            viewBackgroundColor: state.viewBackgroundColor,
            currentItemFontFamily: state.currentItemFontFamily,
            currentItemFontSize: state.currentItemFontSize,
            currentItemStrokeColor: state.currentItemStrokeColor,
            currentItemBackgroundColor: state.currentItemBackgroundColor,
            currentItemFillStyle: state.currentItemFillStyle,
            currentItemStrokeWidth: state.currentItemStrokeWidth,
            currentItemStrokeStyle: state.currentItemStrokeStyle,
            currentItemRoughness: state.currentItemRoughness,
            currentItemOpacity: state.currentItemOpacity,
            zoom: state.zoom,
            scrollX: state.scrollX,
            scrollY: state.scrollY,
          };
          
          if (currentFilePath) {
            // 要素の変更を検出（JSONで比較）
            const currentElementsString = JSON.stringify(elements);
            const hasElementsChanged = currentElementsString !== lastSavedElements;
            
            if (hasElementsChanged) {
              // ファイルパスが指定されている場合はファイルに保存
              const fileData: ExcalidrawFileData = {
                type: "excalidraw",
                version: 2,
                source: "https://excalidraw.com",
                elements,
                appState: stateToSave,
                files: files || {}
              };
              
              saveExcalidrawFile(currentFilePath, fileData).then(success => {
                if (success) {
                  console.log(`File saved to: ${currentFilePath}`);
                  setLastSavedElements(currentElementsString);
                  setLastFileModified(Date.now());
                } else {
                  console.error(`Failed to save file: ${currentFilePath}`);
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
            
            saveAppStateToLocalStorage(stateToSave);
          }
        },
      },
    );
    return newElement;
  };

  return (
    <div className="App" ref={appRef}>
      <div className="excalidraw-wrapper">
        {renderExcalidraw(children)}
      </div>
    </div>
  );
}