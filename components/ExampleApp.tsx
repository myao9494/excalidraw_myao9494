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

  useCustom(excalidrawAPI, customArgs);

  // カスタムキーボードショートカット機能を追加
  useKeyboardShortcuts({
    excalidrawAPI,
    viewportCoordsToSceneCoords,
  });

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    
    // ローカルストレージからデータを読み込み
    const savedElements = loadElementsFromLocalStorage();
    const savedAppState = loadAppStateFromLocalStorage();
    const savedFiles = loadBinaryFilesFromLocalStorage();
    
    //@ts-ignore
    initialStatePromiseRef.current.promise.resolve({
      ...initialData,
      elements: savedElements.length > 0 ? savedElements : convertToExcalidrawElements(initialData.elements),
      appState: savedAppState ? { ...initialData.appState, ...savedAppState } : initialData.appState,
      files: savedFiles,
    });
  }, [excalidrawAPI, convertToExcalidrawElements]);

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
          
          // ローカルストレージに保存
          saveElementsToLocalStorage(elements);
          
          // 画像データも保存
          if (files) {
            saveBinaryFilesToLocalStorage(files);
          }
          
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
          
          saveAppStateToLocalStorage(stateToSave);
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