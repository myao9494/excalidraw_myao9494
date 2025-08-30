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
  exportToSvgFile,
  type ExcalidrawFileData
} from "../utils/fileUtils";
import { generateTabTitle } from "../utils/titleUtils";

import "./ExampleApp.scss";

import type { ResolvablePromise } from "../utils";

/**
 * 新規ファイル作成用のダイアログを表示する
 */
const showNewFileDialog = (currentFolder: string | null) => {
  const fileName = prompt("新しいファイル名を入力してください（拡張子なし）:");
  if (fileName && fileName.trim()) {
    const normalizedFolder = currentFolder ? normalizePath(currentFolder) : null;
    const fullPath = normalizedFolder 
      ? `${normalizedFolder}/${fileName.trim()}.excalidraw`
      : `${fileName.trim()}.excalidraw`;
    
    // 新しいファイルのURLにリダイレクト（パスをエンコードしない）
    window.location.href = `${window.location.origin}${window.location.pathname}?filepath=${fullPath}`;
  }
};

/**
 * パスを/区切りに正規化する
 */
const normalizePath = (path: string): string => {
  return path.replace(/\\/g, '/');
};


/**
 * ファイル選択ダイアログを表示する（ファイルビューアーを使用）
 */
const showOpenFileDialog = (currentFolder: string | null) => {
  // 現在のフォルダまたはブラウザのカレントディレクトリを使用
  let folderPath = currentFolder ? normalizePath(currentFolder) : '.';
  
  // URLを手動で構築
  const currentHost = window.location.hostname;
  const baseUrl = `http://${currentHost}:5001`;
  const encodedPath = encodeURIComponent(folderPath);
  const filterParam = 'filter=md,svg,csv,pdf,ipynb,py,docx,xlsx,xlsm,pptx,msg,lnk,excalidraw,excalidraw.svg,excalidraw.png';
  const fileViewerUrl = `${baseUrl}/fullpath?path=${encodedPath}&${filterParam}`;
  
  // ファイルビューアーを新しいタブで開く
  window.open(fileViewerUrl, '_blank');
};

/**
 * codeでフォルダを開く
 */
const openInCode = async (currentFolder: string | null) => {
  // 現在のフォルダまたはブラウザのカレントディレクトリを使用
  let folderPath = currentFolder ? normalizePath(currentFolder) : '.';
  
  try {
    const currentHost = window.location.hostname;
    const response = await fetch(`http://${currentHost}:5001/open-in-code2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: folderPath
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('codeで開きました:', folderPath);
    } else {
      console.error('codeで開くのに失敗しました:', result.error);
    }
  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
};


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
  const [saveNotification, setSaveNotification] = useState<{message: string; isError?: boolean} | null>(null);
  
  // 保存通知を表示する関数
  const showSaveNotification = useCallback((message: string, isError: boolean = false) => {
    setSaveNotification({message, isError});
    setTimeout(() => {
      setSaveNotification(null);
    }, 2000);
  }, []);
  
  // 現在のフォルダパスを取得する関数（Windows/Unix両対応）
  const getCurrentFolder = useCallback(() => {
    if (!currentFilePath) {
      console.log('getCurrentFolder: currentFilePath is null or undefined');
      return null;
    }
    
    // Windows と Unix の両方のパス区切り文字に対応
    const normalizedPath = currentFilePath.replace(/\\/g, '/');
    const lastSlashIndex = normalizedPath.lastIndexOf('/');
    
    const result = lastSlashIndex !== -1 ? normalizedPath.substring(0, lastSlashIndex) : null;
    
    console.log('getCurrentFolder Debug Info:');
    console.log('  Original currentFilePath:', currentFilePath);
    console.log('  Normalized path:', normalizedPath);
    console.log('  Last slash index:', lastSlashIndex);
    console.log('  Result folder path:', result);
    
    return result;
  }, [currentFilePath]);
  
  // SVGファイルとして保存する関数
  const exportSvg = useCallback(async (currentFolder: string | null) => {
    if (!excalidrawAPI) {
      console.error('Excalidraw APIが利用できません');
      return;
    }

    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      
      // 選択された要素を取得
      const selectedElements = elements.filter(element => appState.selectedElementIds[element.id]);
      
      const success = await exportToSvgFile(
        elements,
        appState,
        files,
        currentFolder,
        selectedElements.length > 0 ? selectedElements : null
      );
      
      if (success) {
        console.log('SVGファイルの保存に成功しました');
      } else {
        console.error('SVGファイルの保存に失敗しました');
      }
    } catch (error) {
      console.error('SVGエクスポート中にエラーが発生しました:', error);
    }
  }, [excalidrawAPI]);
  
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
      // Excalidrawファイル以外の場合はfile viewerを新しいタブで開く
      if (!filePath.toLowerCase().endsWith('.excalidraw')) {
        const currentHost = window.location.hostname;
        const fileViewerUrl = `http://${currentHost}:5001/fullpath?path=${filePath}`;
        window.open(fileViewerUrl, '_blank');
        // URLパラメータをクリアして元の状態に戻す
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
    }
    
    setCurrentFilePath(filePath);
  }, []);

  // タブタイトルを設定するuseEffect
  useEffect(() => {
    const tabTitle = generateTabTitle(currentFilePath);
    document.title = tabTitle;
  }, [currentFilePath]);

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
      
      // ライブラリファイルをロードしてlibraryItemsに追加
      try {
        const response = await fetch('/excalidraw_lib/my_lib.excalidrawlib');
        if (response.ok) {
          const libraryContent = await response.text();
          const libraryData = JSON.parse(libraryContent);
          
          if (libraryData.libraryItems) {
            // 各ライブラリアイテムと要素のIDを新しい一意のIDに更新
            const updatedLibraryItems = libraryData.libraryItems.map((item: any) => ({
              ...item,
              id: `lib-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              elements: item.elements?.map((element: any) => ({
                ...element,
                id: `elem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                // グループIDも更新
                groupIds: element.groupIds?.map(() => `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
              }))
            }));
            
            dataToLoad.libraryItems = updatedLibraryItems;
            console.log(`ライブラリを読み込みました: ${updatedLibraryItems.length} アイテム`);
          }
        }
      } catch (error) {
        console.warn('ライブラリファイルの読み込みに失敗しました:', error);
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

  // 効率的な変更検知関数（削除要素も考慮）
  const isSignificantChange = useCallback((elements: NonDeletedExcalidrawElement[]): boolean => {
    const currentFilePathValue = currentFilePathRef.current;
    if (!currentFilePathValue) return true; // ローカルストレージの場合は常に保存

    // 削除された要素も含めて全要素を取得
    const allElements = excalidrawAPI?.getSceneElementsIncludingDeleted() || [];
    
    // 削除操作の特別な検知：要素数の変化を最優先でチェック
    let lastSavedData;
    try {
      lastSavedData = JSON.parse(lastSavedElementsRef.current);
    } catch {
      return true; // パース失敗時は保存を実行
    }

    // 削除された要素の数をカウント
    const deletedCount = allElements.filter(el => el.isDeleted).length;
    const activeCount = elements.length;
    const totalCount = activeCount + deletedCount;
    
    // 削除された要素が検知された場合は即座に変更と判定
    if (deletedCount > 0) {
      console.log(`[Change Detection] Deleted elements detected: ${deletedCount} deleted, ${activeCount} active`);
      return true;
    }

    // 要素数が変化した場合（削除や追加）は即座に変更と判定
    if (lastSavedData.count !== activeCount) {
      console.log(`[Change Detection] Element count changed: ${lastSavedData.count} → ${activeCount}`);
      return true;
    }

    // 包括的な変更検知：すべての重要なプロパティを含む
    const currentSummary = {
      count: activeCount,
      ids: elements.map(el => el.id).sort().join(','),
      // 位置・サイズ・回転を1px/1度単位で検知
      geometry: elements.map(el => `${el.id}:${Math.round(el.x)},${Math.round(el.y)},${Math.round(el.width)},${Math.round(el.height)},${Math.round(el.angle || 0)}`).sort().join('|'),
      // テキスト内容の変更を検知
      texts: elements.filter(el => el.type === 'text').map(el => `${el.id}:${el.text || ''}`).sort().join('|'),
      // スタイル変更を検知（色、線の太さ、フィルなど）
      styles: elements.map(el => `${el.id}:${el.strokeColor},${el.backgroundColor},${el.fillStyle},${el.strokeWidth},${el.roughness},${el.opacity}`).sort().join('|'),
      // 矢印やリンクなどの追加プロパティ
      extras: elements.map(el => {
        const extras = [];
        if (el.type === 'arrow' && el.startArrowhead) extras.push(`start:${el.startArrowhead}`);
        if (el.type === 'arrow' && el.endArrowhead) extras.push(`end:${el.endArrowhead}`);
        if (el.link) extras.push(`link:${el.link}`);
        if (el.groupIds && el.groupIds.length > 0) extras.push(`groups:${el.groupIds.join(',')}`);
        return `${el.id}:${extras.join(';')}`;
      }).sort().join('|')
    };
    
    const currentSummaryString = JSON.stringify(currentSummary);
    const hasChanged = currentSummaryString !== lastSavedElementsRef.current;
    
    if (hasChanged) {
      console.log(`[Change Detection] Detailed change detected`);
    }
    
    return hasChanged;
  }, [excalidrawAPI]);

  // デバウンス処理を行う保存関数（10秒間隔制限付き）
  const debouncedSave = useCallback((
    elements: NonDeletedExcalidrawElement[],
    appState: any,
    files: any
  ) => {
    // 重要な変更かどうかをチェック
    if (!isSignificantChange(elements)) {
      return; // 重要でない変更はスキップ
    }

    const now = Date.now();
    
    // 最後の保存から10秒経過していない場合は保存をスキップ
    if (now - lastSaveTimeRef.current < 10000) {
      console.log(`[Save Throttle] Skipping save - only ${Math.round((now - lastSaveTimeRef.current) / 1000)}s since last save`);
      return;
    }

    // 削除要素の検知
    const allElements = excalidrawAPI?.getSceneElementsIncludingDeleted() || [];
    const deletedCount = allElements.filter(el => el.isDeleted).length;
    const activeCount = elements.length;
    
    // 削除操作の場合でも10秒制限を適用
    if (deletedCount > 0) {
      console.log(`[Throttled Save] Deletion detected: ${deletedCount} deleted elements, ${activeCount} active`);
      performSave(elements, appState, files);
      return;
    }

    // 要素数の変化による削除検知（従来の方法も併用）
    let lastSavedData;
    try {
      lastSavedData = JSON.parse(lastSavedElementsRef.current);
      // 要素数が減った場合（削除操作）でも10秒制限を適用
      if (lastSavedData.count > activeCount) {
        console.log(`[Throttled Save] Element count deletion detected: ${lastSavedData.count} → ${activeCount}`);
        performSave(elements, appState, files);
        return;
      }
    } catch {
      // パース失敗時は通常の処理を実行
    }

    // 既存のタイマーをクリア
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // 保存待機中でない場合のみログ出力
    if (!pendingSaveRef.current) {
      console.log(`[Throttled Save] Scheduling save (elements: ${activeCount})`);
      pendingSaveRef.current = true;
    }

    lastChangeTimeRef.current = now;

    // 3秒のデバウンス処理（細かい変更をまとめるため）
    saveTimeoutRef.current = setTimeout(() => {
      // 最後の変更から3秒経過していることを確認
      if (now === lastChangeTimeRef.current || Date.now() - lastChangeTimeRef.current >= 2800) {
        performSave(elements, appState, files);
        pendingSaveRef.current = false;
      }
      saveTimeoutRef.current = null;
    }, 3000);
  }, [isSignificantChange, excalidrawAPI]);

  // 実際の保存処理を実行する関数
  const performSave = useCallback((
    elements: NonDeletedExcalidrawElement[],
    appState: any,
    files: any,
    forceBackup: boolean = false
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
      // 削除要素の情報も考慮した包括的な変更検知
      const allElements = excalidrawAPI?.getSceneElementsIncludingDeleted() || [];
      const deletedCount = allElements.filter(el => el.isDeleted).length;
      
      const currentSummary = {
        count: elements.length,
        deletedCount: deletedCount,
        ids: elements.map(el => el.id).sort().join(','),
        // 位置・サイズ・回転を1px/1度単位で検知
        geometry: elements.map(el => `${el.id}:${Math.round(el.x)},${Math.round(el.y)},${Math.round(el.width)},${Math.round(el.height)},${Math.round(el.angle || 0)}`).sort().join('|'),
        // テキスト内容の変更を検知
        texts: elements.filter(el => el.type === 'text').map(el => `${el.id}:${el.text || ''}`).sort().join('|'),
        // スタイル変更を検知（色、線の太さ、フィルなど）
        styles: elements.map(el => `${el.id}:${el.strokeColor},${el.backgroundColor},${el.fillStyle},${el.strokeWidth},${el.roughness},${el.opacity}`).sort().join('|'),
        // 矢印やリンクなどの追加プロパティ
        extras: elements.map(el => {
          const extras = [];
          if (el.type === 'arrow' && el.startArrowhead) extras.push(`start:${el.startArrowhead}`);
          if (el.type === 'arrow' && el.endArrowhead) extras.push(`end:${el.endArrowhead}`);
          if (el.link) extras.push(`link:${el.link}`);
          if (el.groupIds && el.groupIds.length > 0) extras.push(`groups:${el.groupIds.join(',')}`);
          return `${el.id}:${extras.join(';')}`;
        }).sort().join('|')
      };
      const currentSummaryString = JSON.stringify(currentSummary);
      
      // 削除要素が存在する場合は常に保存を実行
      if (deletedCount > 0 || currentSummaryString !== lastSavedElementsRef.current) {
        // ファイルパスが指定されている場合はファイルに保存
        const fileData: ExcalidrawFileData = {
          type: "excalidraw",
          version: 2,
          source: "https://excalidraw.com",
          elements,
          appState: stateToSave,
          files: files || {}
        };
        
        saveExcalidrawFile(currentFilePathValue, fileData, forceBackup).then(success => {
          if (success) {
            console.log(`[Save] File saved successfully (${elements.length} elements, ${deletedCount} deleted)`);
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
  }, [excalidrawAPI]);

  // 強制保存関数（10秒制限を無視）
  const forceSave = useCallback((
    elements: NonDeletedExcalidrawElement[],
    appState: any,
    files: any
  ) => {
    console.log(`[Force Save] Executing forced save (elements: ${elements.length})`);
    
    // 10秒制限を無視して即座に保存
    const originalLastSaveTime = lastSaveTimeRef.current;
    lastSaveTimeRef.current = 0; // 制限をバイパス
    
    performSave(elements, appState, files);
    
    // 保存後に実際の時刻を設定
    lastSaveTimeRef.current = Date.now();
  }, [performSave]);

  // 手動保存関数（強制バックアップ付き）
  const manualSave = useCallback((
    elements: NonDeletedExcalidrawElement[],
    appState: any,
    files: any
  ) => {
    console.log(`[Manual Save] Executing manual save with forced backup (elements: ${elements.length})`);
    
    // 既存のperformSave関数を使用して手動保存を実行
    performSave(elements, appState, files, true); // 強制バックアップフラグを渡す
    showSaveNotification('保存しました');
  }, [performSave, showSaveNotification]);


  // ウィンドウを閉じる前と各種イベントでの強制保存
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // 保存待機中のタイマーがある場合はクリア
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        pendingSaveRef.current = false;
      }
      
      // 最新の状態を取得して強制保存
      if (excalidrawAPI) {
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        
        // 同期的に保存を実行（beforeunloadは同期処理が必要）
        forceSave(elements, appState, files);
      }
    };

    const handleUnload = () => {
      // unloadイベントでも確実に保存
      if (excalidrawAPI) {
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        forceSave(elements, appState, files);
      }
    };

    const handleVisibilityChange = () => {
      // ページが隠れる時（タブ切り替え、最小化など）にも保存
      if (document.visibilityState === 'hidden' && excalidrawAPI) {
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        forceSave(elements, appState, files);
      }
    };

    const handlePageHide = () => {
      // pagehideイベントでも確実に保存
      if (excalidrawAPI) {
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        forceSave(elements, appState, files);
      }
    };

    // 複数のイベントでの保存を設定
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [excalidrawAPI, forceSave]);

  // コンポーネントのクリーンアップ時にタイマーをクリア
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  // ライブラリ変更時の自動保存処理
  const handleLibraryChange = useCallback(async (libraryItems: any[]) => {
    console.log(`ライブラリが変更されました: ${libraryItems.length} アイテム`);
    
    // 空のライブラリデータの保存を防止
    if (!libraryItems || libraryItems.length === 0) {
      console.warn('空のライブラリデータの保存をスキップしました');
      return;
    }
    
    // 既存のライブラリファイルの内容を確認
    try {
      const currentResponse = await fetch('/excalidraw_lib/my_lib.excalidrawlib');
      if (currentResponse.ok) {
        const currentContent = await currentResponse.text();
        const currentData = JSON.parse(currentContent);
        
        // 現在のファイルにデータがあり、新しいデータが空の場合は保存しない
        if (currentData.libraryItems && currentData.libraryItems.length > 0 && libraryItems.length === 0) {
          console.warn('既存のライブラリデータを保護するため、空のデータでの上書きをスキップしました');
          return;
        }
      }
    } catch (error) {
      console.warn('既存ライブラリファイルの確認に失敗:', error);
    }
    
    try {
      const libraryData = {
        type: "excalidrawlib",
        version: 2,
        source: window.location.origin,
        libraryItems
      };
      
      const response = await fetch(`http://${window.location.hostname}:8008/save-library`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_path: 'public/excalidraw_lib/my_lib.excalidrawlib',
          data: libraryData
        })
      });
      
      if (response.ok) {
        console.log('ライブラリが自動保存されました');
      } else {
        console.error('ライブラリの保存に失敗しました');
      }
    } catch (error) {
      console.error('ライブラリ保存中にエラーが発生しました:', error);
    }
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
        langCode: 'ja-JP',
        onChange: (
          elements: NonDeletedExcalidrawElement[],
          state: AppState,
          files: any,
        ) => {
          // デバウンス処理を使用して保存
          debouncedSave(elements, state, files);
        },
        onLibraryChange: handleLibraryChange,
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
      {/* 保存通知 */}
      {saveNotification && (
        <div className={`save-notification ${saveNotification.isError ? 'error' : ''}`}>
          {saveNotification.message}
        </div>
      )}
      
      {/* カスタムヘッダー */}
      <div className="custom-header">
        <div className="header-actions">
          <button 
            className="header-btn new-file-btn"
            onClick={() => showNewFileDialog(getCurrentFolder())}
            title="新規作成"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button 
            type="button"
            className="header-btn open-folder-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              showOpenFileDialog(getCurrentFolder());
            }}
            title="フォルダを表示"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <button 
            className="header-btn open-code-btn"
            onClick={() => openInCode(getCurrentFolder())}
            title="codeで開く"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16,18 22,12 16,6"></polyline>
              <polyline points="8,6 2,12 8,18"></polyline>
            </svg>
          </button>
          <button 
            className="header-btn manual-save-btn"
            onClick={() => {
              if (excalidrawAPI) {
                const elements = excalidrawAPI.getSceneElements();
                const appState = excalidrawAPI.getAppState();
                const files = excalidrawAPI.getFiles();
                manualSave(elements, appState, files);
              }
            }}
            title="手動保存（強制バックアップ）"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17,21 17,13 7,13 7,21"></polyline>
              <polyline points="7,3 7,8 15,8"></polyline>
            </svg>
          </button>
          <button 
            className="header-btn export-svg-btn"
            onClick={() => exportSvg(getCurrentFolder())}
            title="SVGで保存"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <polyline points="7,18 12,23 17,18"></polyline>
              <line x1="12" y1="23" x2="12" y2="12"></line>
              <text x="12" y="9" textAnchor="middle" fontSize="15" fill="currentColor">svg</text>
            </svg>
          </button>
        </div>
      </div>
      <div className="excalidraw-wrapper" ref={containerRef}>
        {renderExcalidraw(children)}
      </div>
    </div>
  );
}