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
    //@ts-ignore
    initialStatePromiseRef.current.promise.resolve({
      ...initialData,
      elements: convertToExcalidrawElements(initialData.elements),
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
        ) => {
          console.info("Elements :", elements, "State : ", state);
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