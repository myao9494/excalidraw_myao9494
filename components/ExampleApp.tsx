import React, {
  useEffect,
  useState,
  useRef,
  Children,
  cloneElement,
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
        const fileData = await loadExcalidrawFile(currentFilePath);
        if (fileData) {
          dataToLoad = {
            ...initialData,
            elements: fileData.elements.length > 0 ? fileData.elements : convertToExcalidrawElements(initialData.elements),
            appState: fileData.appState ? { ...initialData.appState, ...fileData.appState } : initialData.appState,
            files: fileData.files || {},
          };
        } else {
          // ファイルが存在しない場合は初期データを使用
          dataToLoad = {
            ...initialData,
            elements: convertToExcalidrawElements(initialData.elements),
            appState: initialData.appState,
            files: {},
          };
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
              } else {
                console.error(`Failed to save file: ${currentFilePath}`);
              }
            });
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