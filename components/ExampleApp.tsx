import React, {
  useEffect,
  useState,
  useRef,
  Children,
  cloneElement,
  useCallback,
  useMemo,
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
  openFileViaBackend,
  exportToSvgFile,
  isExcalidrawFile,
  type ExcalidrawFileData
} from "../utils/fileUtils";
import { generateTabTitle } from "../utils/titleUtils";

import "./ExampleApp.scss";

import type { ResolvablePromise } from "../utils";

import defaultTemplateRaw from "../shoki.excalidraw?raw";

const SAVE_DELAY_MS = 10000;

let DEFAULT_TEMPLATE_DATA: ExcalidrawFileData | null = null;

try {
  DEFAULT_TEMPLATE_DATA = JSON.parse(defaultTemplateRaw) as ExcalidrawFileData;
} catch (error) {
  console.error('テンプレートファイルの解析に失敗しました:', error);
  DEFAULT_TEMPLATE_DATA = null;
}

const ensureTemplateForNewFile = async (targetPath: string): Promise<boolean> => {
  if (!DEFAULT_TEMPLATE_DATA) {
    console.error('テンプレートデータが利用できません。');
    if (typeof window !== 'undefined' && window.alert) {
      window.alert('テンプレートデータを読み込めなかったため、新規ファイルを作成できませんでした。');
    }
    return false;
  }

  try {
    const templateClone = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE_DATA)) as ExcalidrawFileData;
    const saveResult = await saveExcalidrawFile(targetPath, templateClone, true);

    if (!saveResult?.success) {
      throw new Error(saveResult?.message || 'テンプレートデータの保存に失敗しました');
    }

    return true;
  } catch (error) {
    console.error('Error preparing new file from template:', error);
    if (typeof window !== 'undefined' && window.alert) {
      window.alert('テンプレートの保存に失敗したため、新規ファイルを作成できませんでした。');
    }
    return false;
  }
};

/**
 * 新規ファイル作成用のダイアログを表示する
 */
const showNewFileDialog = async (currentFolder: string | null) => {
  const fileName = prompt("新しいファイル名を入力してください（拡張子なし）:");
  if (!fileName || !fileName.trim()) {
    return;
  }

  const normalizedFolder = currentFolder ? normalizePath(currentFolder) : null;
  const fullPath = normalizedFolder
    ? `${normalizedFolder}/${fileName.trim()}.excalidraw`
    : `${fileName.trim()}.excalidraw`;
  const normalizedFullPath = normalizePath(fullPath);

  const prepared = await ensureTemplateForNewFile(normalizedFullPath);
  if (!prepared) {
    return;
  }

  // 新しいファイルは別タブで開く（パスをエンコードしてセッションを保持）
  const encodedPath = encodeURIComponent(normalizedFullPath);
  const targetUrl = `${window.location.origin}${window.location.pathname}?filepath=${encodedPath}`;
  window.open(targetUrl, '_blank', 'noopener');
};

/**
 * パスを/区切りに正規化する
 */
const normalizePath = (path: string): string => {
  return path.replace(/\\/g, '/');
};


interface DirectoryBrowserEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number | null;
  modified?: number | null;
}


const formatModified = (value: number | null | undefined): string => {
  if (value == null) {
    return '';
  }
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatSize = (value: number | null | undefined): string => {
  if (value == null) {
    return '';
  }
  if (value < 1024) {
    return `${value} バイト`;
  }
  const kb = value / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

const getTypeLabel = (entry: DirectoryBrowserEntry): string => {
  if (entry.isDir) {
    return 'ファイル フォルダー';
  }
  const parts = entry.name.split('.');
  if (parts.length > 1) {
    const ext = parts.pop() || '';
    if (ext.toLowerCase() === 'excalidraw') {
      return 'EXCALIDRAW ファイル (.excalidraw)';
    }
    return `${ext.toUpperCase()} ファイル`;
  }
  return 'ファイル';
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

/**
 * OSのファイルマネージャーでフォルダを開く
 */
const openInFileExplorer = async (currentFolder: string | null) => {
  const folderPath = currentFolder ? normalizePath(currentFolder) : null;

  if (!folderPath) {
    alert('現在のフォルダが取得できません。ファイルを開いてからお試しください。');
    return;
  }

  try {
    const currentHost = window.location.hostname;
    const response = await fetch(`http://${currentHost}:8008/api/open-folder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: folderPath,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.success) {
      const message = (result && (result.detail || result.error)) || 'フォルダを開くことができませんでした。';
      console.error('フォルダを開く処理でエラー:', message);
      alert(message);
      return;
    }

    console.log('ファイルマネージャーでフォルダを開きました:', result.openedPath || folderPath);
  } catch (error) {
    console.error('フォルダを開く処理で例外が発生しました:', error);
    alert('フォルダを開く処理でエラーが発生しました。詳細はコンソールを確認してください。');
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
  const [lastFileHash, setLastFileHash] = useState<string>('');
  const [saveNotification, setSaveNotification] = useState<{ message: string; isError?: boolean } | null>(null);
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState<boolean>(false);
  const [isFileBrowserLoading, setIsFileBrowserLoading] = useState<boolean>(false);
  const [fileBrowserEntries, setFileBrowserEntries] = useState<DirectoryBrowserEntry[]>([]);
  const [fileBrowserPath, setFileBrowserPath] = useState<string | null>(null);
  const [fileBrowserParentPath, setFileBrowserParentPath] = useState<string | null>(null);
  const [fileBrowserError, setFileBrowserError] = useState<string | null>(null);
  const [fileBrowserSelectedEntry, setFileBrowserSelectedEntry] = useState<DirectoryBrowserEntry | null>(null);
  const [fileBrowserInputValue, setFileBrowserInputValue] = useState<string>('');

  // 保存通知を表示する関数
  const showSaveNotification = useCallback((message: string, isError: boolean = false) => {
    setSaveNotification({ message, isError });
    setTimeout(() => {
      setSaveNotification(null);
    }, 2000);
  }, []);

  // 現在のフォルダパスを取得する関数（Windows/Unix両対応）
  const getCurrentFolder = useCallback(() => {
    if (!currentFilePath) {
      // console.log('getCurrentFolder: currentFilePath is null or undefined');
      return null;
    }

    // Windows と Unix の両方のパス区切り文字に対応
    const normalizedPath = currentFilePath.replace(/\\/g, '/');
    const lastSlashIndex = normalizedPath.lastIndexOf('/');

    const result = lastSlashIndex !== -1 ? normalizedPath.substring(0, lastSlashIndex) : null;

    // console.log('getCurrentFolder Debug Info:');
    // console.log('  Original currentFilePath:', currentFilePath);
    // console.log('  Normalized path:', normalizedPath);
    // console.log('  Last slash index:', lastSlashIndex);
    // console.log('  Result folder path:', result);

    return result;
  }, [currentFilePath]);

  const fetchDirectoryContents = useCallback(async (targetPath: string | null) => {
    setIsFileBrowserLoading(true);
    setFileBrowserError(null);

    try {
      const currentHost = window.location.hostname || "localhost";
      const response = await fetch(`http://${currentHost}:8008/api/list-directory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: targetPath ?? undefined,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        const message = result?.error || result?.detail || 'ディレクトリ情報の取得に失敗しました。';
        throw new Error(message);
      }

      const entriesArray = Array.isArray(result.entries) ? result.entries : [];
      const mappedEntries: DirectoryBrowserEntry[] = entriesArray.map((entry: any) => ({
        name: entry.name,
        path: entry.path,
        isDir: Boolean(entry.is_dir ?? entry.isDir),
        size: entry.size ?? null,
        modified: entry.modified ?? null,
      }));

      const filteredEntries = mappedEntries.filter((entry) => {
        if (entry.isDir) {
          return true;
        }
        const nameLower = entry.name.toLowerCase();
        return nameLower.endsWith('.excalidraw') || nameLower.endsWith('.excalidraw.md');
      });

      setFileBrowserEntries(filteredEntries);
      setFileBrowserPath(result.path ? normalizePath(result.path) : targetPath ? normalizePath(targetPath) : null);
      setFileBrowserParentPath(result.parentPath ? normalizePath(result.parentPath) : null);
      setFileBrowserSelectedEntry(null);
      setFileBrowserInputValue('');
    } catch (error) {
      console.error('Error fetching directory contents:', error);
      setFileBrowserError(error instanceof Error ? error.message : 'ディレクトリ情報の取得に失敗しました。');
    } finally {
      setIsFileBrowserLoading(false);
    }
  }, []);

  const openFileBrowser = useCallback(() => {
    if (isFileBrowserOpen) {
      return;
    }

    const startPath = getCurrentFolder();
    setIsFileBrowserOpen(true);
    setFileBrowserSelectedEntry(null);
    setFileBrowserInputValue('');
    fetchDirectoryContents(startPath);
  }, [fetchDirectoryContents, getCurrentFolder, isFileBrowserOpen]);

  const closeFileBrowser = useCallback(() => {
    setIsFileBrowserOpen(false);
    setFileBrowserError(null);
    setFileBrowserSelectedEntry(null);
    setFileBrowserInputValue('');
  }, []);

  const openFileFromBrowser = useCallback((rawPath: string) => {
    const normalizedPath = normalizePath(rawPath);
    const currentHost = window.location.hostname || "localhost";
    const encodedPath = encodeURIComponent(normalizedPath);
    const targetUrl = `http://${currentHost}:3001/?filepath=${encodedPath}`;
    window.open(targetUrl, '_blank', 'noopener');
    closeFileBrowser();
  }, [closeFileBrowser]);

  const handleDirectoryNavigate = useCallback((nextPath: string | null) => {
    if (!nextPath) {
      return;
    }
    fetchDirectoryContents(nextPath);
  }, [fetchDirectoryContents]);

  const handleFileBrowserConfirm = useCallback(() => {
    const trimmedInput = fileBrowserInputValue.trim();
    if (trimmedInput) {
      const matchedEntry = fileBrowserEntries.find(
        (entry) => entry.name.toLowerCase() === trimmedInput.toLowerCase(),
      );
      if (matchedEntry) {
        if (matchedEntry.isDir) {
          handleDirectoryNavigate(matchedEntry.path);
        } else {
          openFileFromBrowser(matchedEntry.path);
        }
        return;
      }
    }

    if (fileBrowserSelectedEntry && !fileBrowserSelectedEntry.isDir) {
      openFileFromBrowser(fileBrowserSelectedEntry.path);
      return;
    }

    if (trimmedInput) {
      setFileBrowserError(`ファイルが見つかりません: ${trimmedInput}`);
    }
  }, [
    fileBrowserEntries,
    fileBrowserInputValue,
    fileBrowserSelectedEntry,
    handleDirectoryNavigate,
    openFileFromBrowser,
  ]);

  const handleEntryClick = useCallback((entry: DirectoryBrowserEntry) => {
    setFileBrowserSelectedEntry(entry);
    setFileBrowserError(null);
    if (entry.isDir) {
      setFileBrowserInputValue('');
    } else {
      setFileBrowserInputValue(entry.name);
    }
  }, []);

  const handleEntryDoubleClick = useCallback((entry: DirectoryBrowserEntry) => {
    if (entry.isDir) {
      handleDirectoryNavigate(entry.path);
    } else {
      openFileFromBrowser(entry.path);
    }
  }, [handleDirectoryNavigate, openFileFromBrowser]);

  const handleEntryKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, entry: DirectoryBrowserEntry) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleEntryDoubleClick(entry);
      }
    },
    [handleEntryDoubleClick],
  );

  const displayPathValue = useMemo(() => {
    if (!fileBrowserPath) {
      return '';
    }
    const normalized = normalizePath(fileBrowserPath);
    return normalized.replace(/\//g, '\\');
  }, [fileBrowserPath]);

  const openButtonDisabled = useMemo(() => {
    if (isFileBrowserLoading) {
      return true;
    }
    if (fileBrowserInputValue.trim()) {
      return false;
    }
    if (fileBrowserSelectedEntry && !fileBrowserSelectedEntry.isDir) {
      return false;
    }
    return true;
  }, [fileBrowserInputValue, fileBrowserSelectedEntry, isFileBrowserLoading]);

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
  const lastFileHashRef = useRef<string>('');
  const externalUpdateNotifiedHashRef = useRef<string>('');
  const saveInProgressRef = useRef<boolean>(false);

  // refの値を更新
  useEffect(() => {
    currentFilePathRef.current = currentFilePath;
  }, [currentFilePath]);

  useEffect(() => {
    lastSavedElementsRef.current = lastSavedElements;
  }, [lastSavedElements]);

  useEffect(() => {
    lastFileHashRef.current = lastFileHash;
  }, [lastFileHash]);

  const buildElementSummary = useCallback(
    (elements: NonDeletedExcalidrawElement[], deletedCount: number = 0) => {
      const activeElements = elements.filter((el) => !el.isDeleted);
      const summary = {
        count: activeElements.length,
        deletedCount,
        ids: activeElements.map((el) => el.id).sort().join(','),
        geometry: activeElements
          .map(
            (el) =>
              `${el.id}:${el.x.toFixed(2)},${el.y.toFixed(2)},${el.width.toFixed(2)},${el.height.toFixed(2)},${(el.angle || 0).toFixed(2)}`,
          )
          .sort()
          .join('|'),
        texts: activeElements
          .filter((el) => el.type === 'text')
          .map((el) => `${el.id}:${el.text || ''}`)
          .sort()
          .join('|'),
        styles: activeElements
          .map(
            (el) =>
              `${el.id}:${el.strokeColor},${el.backgroundColor},${el.fillStyle},${el.strokeWidth},${el.roughness},${el.opacity}`,
          )
          .sort()
          .join('|'),
        extras: activeElements
          .map((el) => {
            const extras: string[] = [];
            if (el.type === 'arrow' && el.startArrowhead) extras.push(`start:${el.startArrowhead}`);
            if (el.type === 'arrow' && el.endArrowhead) extras.push(`end:${el.endArrowhead}`);
            if (el.link) extras.push(`link:${el.link}`);
            if (el.groupIds && el.groupIds.length > 0) extras.push(`groups:${el.groupIds.join(',')}`);
            return `${el.id}:${extras.join(';')}`;
          })
          .sort()
          .join('|'),
      };
      return JSON.stringify(summary);
    },
    [],
  );

  // ドラッグ&ドロップ用のコンテナRef
  const containerRef = useRef<HTMLDivElement>(null);

  useCustom(excalidrawAPI, customArgs);

  // ドラッグ&ドロップ機能を追加
  useDragAndDrop({
    excalidrawAPI,
    currentFilePath,
    containerRef,
  });

  // ファイルハッシュの変更をログに出力するuseEffect
  const prevHashRef = useRef<string>();
  useEffect(() => {
    const prevHash = prevHashRef.current;
    if (prevHash !== lastFileHash) {
      console.log(`[Hash Change] Hash updated from ${prevHash || '(initial)'} to ${lastFileHash}`);
    }
    prevHashRef.current = lastFileHash;
  }, [lastFileHash]);

  useEffect(() => {
    const filePath = getFilePathFromUrl();

    // URLパラメータでファイルパスが指定されている場合の処理
    if (filePath) {
      // Excalidrawファイル以外の場合はfile viewerを新しいタブで開く
      if (!isExcalidrawFile(filePath)) {
        void openFileViaBackend(filePath);
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

  const handleOpenFileButtonClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    openFileBrowser();
  }, [openFileBrowser]);

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
          const { data: fileData, hash } = fileResult;
          dataToLoad = {
            ...initialData,
            elements: fileData.elements.length > 0 ? fileData.elements : convertToExcalidrawElements(initialData.elements),
            appState: fileData.appState ? { ...initialData.appState, ...fileData.appState } : initialData.appState,
            files: fileData.files || {},
          };

          const resolvedHash = hash || '';
          setLastFileHash(resolvedHash);
          lastFileHashRef.current = resolvedHash;
          externalUpdateNotifiedHashRef.current = resolvedHash;
          // 初期読み込み時の要素を記録
          const initialSummary = buildElementSummary(
            fileData.elements as NonDeletedExcalidrawElement[],
            0,
          );
          setLastSavedElements(initialSummary);
          lastSavedElementsRef.current = initialSummary;
        } else {
          // ファイルが存在しない場合は初期データを使用
          dataToLoad = {
            ...initialData,
            elements: convertToExcalidrawElements(initialData.elements),
            appState: initialData.appState,
            files: {},
          };
          const emptySummary = buildElementSummary([]);
          setLastSavedElements(emptySummary);
          lastSavedElementsRef.current = emptySummary;
          setLastFileHash('');
          lastFileHashRef.current = '';
          externalUpdateNotifiedHashRef.current = '';
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

        const localSummary = buildElementSummary(
          (savedElements as NonDeletedExcalidrawElement[]) || [],
        );
        setLastSavedElements(localSummary);
        lastSavedElementsRef.current = localSummary;
        setLastFileHash('');
        lastFileHashRef.current = '';
        externalUpdateNotifiedHashRef.current = '';
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
  }, [buildElementSummary, convertToExcalidrawElements, currentFilePath, excalidrawAPI]);

  // 最新値を保持するRef
  const lastSaveTimeRef = useRef<number>(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckTimeRef = useRef<number>(0); // 外部ファイルチェック用のタイムスタンプ
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
    // 削除された要素が検知された場合は即座に変更と判定
    if (deletedCount > 0) {
      // console.log(`[Change Detection] Deleted elements detected: ${deletedCount} deleted, ${activeCount} active`);
      return true;
    }

    // 要素数が変化した場合（削除や追加）は即座に変更と判定
    if (lastSavedData.count !== activeCount) {
      // console.log(`[Change Detection] Element count changed: ${lastSavedData.count} → ${activeCount}`);
      return true;
    }

    // 包括的な変更検知：すべての重要なプロパティを含む
    const currentSummaryString = buildElementSummary(elements, deletedCount);
    const hasChanged = currentSummaryString !== lastSavedElementsRef.current;

    if (hasChanged) {
      // console.log(`[Change Detection] Detailed change detected`);
    }

    return hasChanged;
  }, [excalidrawAPI, buildElementSummary]);

  const applyLoadedFile = useCallback(
    (
      fileData: ExcalidrawFileData,
      hash?: string,
      notifyMessage?: string,
    ) => {
      if (!excalidrawAPI) {
        return;
      }

      const newElements = fileData.elements && fileData.elements.length > 0 ? fileData.elements : [];
      const newAppState = fileData.appState ? { ...fileData.appState } : {};
      const newFiles = fileData.files || {};

      excalidrawAPI.updateScene({
        elements: newElements,
        appState: newAppState,
        files: newFiles,
      });

      const activeElements = excalidrawAPI.getSceneElements() as NonDeletedExcalidrawElement[];
      const deletedElements = excalidrawAPI
        .getSceneElementsIncludingDeleted()
        ?.filter((el) => el.isDeleted).length || 0;

      const summaryString = buildElementSummary(activeElements, deletedElements);
      setLastSavedElements(summaryString);
      lastSavedElementsRef.current = summaryString;

      if (typeof hash === 'string') {
        setLastFileHash(hash);
        lastFileHashRef.current = hash;
        externalUpdateNotifiedHashRef.current = hash;
      }

      if (notifyMessage) {
        showSaveNotification(notifyMessage);
      }
    },
    [buildElementSummary, excalidrawAPI, showSaveNotification],
  );

  // 実際の保存処理を実行する関数
  const performSave = useCallback(async (
    elements: NonDeletedExcalidrawElement[],
    appState: any,
    files: any,
    forceBackup: boolean = false,
    skipConflictCheck: boolean = false
  ) => {
    const now = Date.now();
    const alreadySaving = saveInProgressRef.current;
    saveInProgressRef.current = true;

    try {
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
        const allElements = excalidrawAPI?.getSceneElementsIncludingDeleted() || [];
        const deletedCount = allElements.filter((el) => el.isDeleted).length;
        const currentSummaryString = buildElementSummary(elements, deletedCount);
        let latestRemoteHash = lastFileHashRef.current;
        let shouldForceBackup = forceBackup;
        let conflictOverwrite = false;

        try {
          const skipConflictDetection = skipConflictCheck || alreadySaving;
          const fileInfo = await getFileInfo(currentFilePathValue);
          if (fileInfo?.exists) {
            const remoteHash = fileInfo.hash || '';
            if (remoteHash) {
              latestRemoteHash = remoteHash;
            }

            const hasExternalUpdate =
              !skipConflictDetection &&
              !!remoteHash &&
              remoteHash !== lastFileHashRef.current;

            if (hasExternalUpdate) {
              if (remoteHash) {
                externalUpdateNotifiedHashRef.current = remoteHash;
              }

              // Obsidianファイル（.excalidraw.md）の場合は、確認ダイアログを表示せず自動的に最新を読み込んで保存
              if (currentFilePathValue.endsWith('.excalidraw.md')) {
                const fileResult = await loadExcalidrawFile(currentFilePathValue);
                if (fileResult) {
                  applyLoadedFile(fileResult.data, fileResult.hash);
                  const currentElements = excalidrawAPI.getSceneElements();
                  const currentAppState = excalidrawAPI.getAppState();
                  const currentFiles = excalidrawAPI.getFiles();
                  const saved = await performSave(currentElements, currentAppState, currentFiles, true, true);
                  if (saved) {
                    showSaveNotification('最新の内容を読み込んで保存しました');
                  } else {
                    showSaveNotification('保存に失敗しました', true);
                  }
                } else {
                  showSaveNotification('最新の内容の読み込みに失敗しました', true);
                }
                return false;
              }

              // それ以外のファイルは従来通り確認ダイアログを表示
              const reload = window.confirm(
                'ファイルが他の人によって更新されています。\nOK: 最新の内容を読み込み\nキャンセル: サーバの内容をバックアップして現在の画面き保存',
              );

              if (reload) {
                const fileResult = await loadExcalidrawFile(currentFilePathValue);
                if (fileResult) {
                  applyLoadedFile(
                    fileResult.data,
                    fileResult.hash,
                    '最新の内容を読み込みました',
                  );
                } else {
                  showSaveNotification('最新の内容の読み込みに失敗しました', true);
                }
                return false;
              }

              shouldForceBackup = true;
              conflictOverwrite = true;
            }
          }
        } catch (error) {
          console.error('Error checking file info before save:', error);
        }

        if (deletedCount > 0 || currentSummaryString !== lastSavedElementsRef.current || shouldForceBackup) {
          const fileData: ExcalidrawFileData = {
            type: "excalidraw",
            version: 2,
            source: "https://excalidraw.com",
            elements,
            appState: stateToSave,
            files: files || {},
          };

          const saveResult = await saveExcalidrawFile(currentFilePathValue, fileData, shouldForceBackup);
          if (saveResult?.success) {
            // console.log(
            //   `[Save] File saved successfully (${elements.length} elements, ${deletedCount} deleted)`,
            // );
            setLastSavedElements(currentSummaryString);
            lastSavedElementsRef.current = currentSummaryString;
            lastSaveTimeRef.current = now;

            const resolvedHash = saveResult.hash || latestRemoteHash;
            if (resolvedHash) {
              setLastFileHash(resolvedHash);
              lastFileHashRef.current = resolvedHash;
              externalUpdateNotifiedHashRef.current = resolvedHash;
            }

            if (conflictOverwrite) {
              showSaveNotification('最新の内容をバックアップして上書き保存しました');
            }
            return true;
          } else {
            const message = saveResult?.message || 'ファイルの保存に失敗しました';
            showSaveNotification(message, true);
            return false;
          }
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
        return true;
      }

      return false;
    } finally {
      if (!alreadySaving) {
        saveInProgressRef.current = false;
      }
    }
  }, [applyLoadedFile, buildElementSummary, excalidrawAPI, showSaveNotification]);

  // 定期的にファイルの更新日時をチェック
  const checkFileUpdates = useCallback(async () => {
    if (!currentFilePath || !excalidrawAPI) {
      return;
    }
    if (saveInProgressRef.current) {
      return;
    }
    try {
      const fileInfo = await getFileInfo(currentFilePath);
      if (!fileInfo || !fileInfo.exists) {
        return;
      }

      const remoteHash = fileInfo.hash || '';
      const hasNewerVersion = !!remoteHash && remoteHash !== lastFileHashRef.current;
      const alreadyNotified = remoteHash === externalUpdateNotifiedHashRef.current;

      if (hasNewerVersion && !alreadyNotified) {
        if (remoteHash) {
          externalUpdateNotifiedHashRef.current = remoteHash;
        }

        // Obsidianファイル（.excalidraw.md）の場合は、確認ダイアログを表示せず自動的に最新を読み込んで保存
        if (currentFilePath.endsWith('.excalidraw.md')) {
          const fileResult = await loadExcalidrawFile(currentFilePath);
          if (fileResult) {
            applyLoadedFile(fileResult.data, fileResult.hash);
            const currentElements = excalidrawAPI.getSceneElements();
            const currentAppState = excalidrawAPI.getAppState();
            const currentFiles = excalidrawAPI.getFiles();
            const saved = await performSave(currentElements, currentAppState, currentFiles, true, true);
            if (saved) {
              showSaveNotification('最新の内容を読み込んで保存しました');
            } else {
              showSaveNotification('保存に失敗しました', true);
            }
          } else {
            showSaveNotification('最新の内容の読み込みに失敗しました', true);
          }
        } else {
          // それ以外のファイルは従来通り確認ダイアログを表示
          const shouldReload = window.confirm(
            'ファイルが他の人によって更新されています。\nOK: 最新の内容を読み込み\nキャンセル: 現在の内容をバックアップして上書き保存',
          );

          if (shouldReload) {
            const fileResult = await loadExcalidrawFile(currentFilePath);
            if (fileResult) {
              applyLoadedFile(fileResult.data, fileResult.hash, '最新の内容を読み込みました');
            } else {
              showSaveNotification('最新の内容の読み込みに失敗しました', true);
            }
          } else {
            const currentElements = excalidrawAPI.getSceneElements();
            const currentAppState = excalidrawAPI.getAppState();
            const currentFiles = excalidrawAPI.getFiles();
            const saved = await performSave(currentElements, currentAppState, currentFiles, true, true);
            if (saved) {
              showSaveNotification('最新の内容をバックアップして上書き保存しました');
            } else {
              showSaveNotification('上書き保存に失敗しました', true);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking file updates:', error);
    }
  }, [currentFilePath, excalidrawAPI, applyLoadedFile, performSave, showSaveNotification]);

  // デバウンス処理を行う保存関数（10秒間隔制限付き）
  // - 編集が発生しても10秒に1度だけ保存を許可する
  // - 保存直前にExcalidraw APIから最新の状態を取り直し、不要な保存を避ける
  // - 外部更新の監視もここで一定間隔ごとにトリガーする
  const debouncedSave = useCallback((
    elements: NonDeletedExcalidrawElement[],
    appState: AppState,
    files: any
  ) => {
    if (!isSignificantChange(elements)) {
      return;
    }

    // 外部更新チェックは5秒間隔で実行し、編集中でも最新の変更を拾えるようにする
    const now = Date.now();
    if (now - lastCheckTimeRef.current > 5000) {
      lastCheckTimeRef.current = now;
      void checkFileUpdates();
    }

    // すでに保存待ちのタイマーが動いている場合は何もせず、10秒後の保存にまとめる
    if (saveTimeoutRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    pendingSaveRef.current = true;

    saveTimeoutRef.current = setTimeout(async () => {
      saveTimeoutRef.current = null;

      const api = excalidrawAPI;
      if (!api) {
        pendingSaveRef.current = false;
        return;
      }

      // 10秒経過時点で再度最新要素を取得し、保存すべきかを再評価
      const currentElements = api.getSceneElements() as NonDeletedExcalidrawElement[];
      if (!isSignificantChange(currentElements)) {
        pendingSaveRef.current = false;
        return;
      }

      const currentAppState = api.getAppState();
      const currentFiles = api.getFiles();

      pendingSaveRef.current = false;

      // ここで初めて保存を実行。10秒以内の変更は一括で保存される
      await performSave(currentElements, currentAppState, currentFiles);
    }, SAVE_DELAY_MS);
  }, [checkFileUpdates, excalidrawAPI, isSignificantChange, performSave]);

  // 強制保存関数（10秒制限を無視）
  const forceSave = useCallback(async (
    elements: NonDeletedExcalidrawElement[],
    appState: any,
    files: any
  ) => {
    // console.log(`[Force Save] Executing forced save (elements: ${elements.length})`);

    // 10秒制限を無視して即座に保存
    lastSaveTimeRef.current = 0; // 制限をバイパス

    await performSave(elements, appState, files);

    // 保存後に実際の時刻を設定
    lastSaveTimeRef.current = Date.now();
  }, [performSave]);

  // 手動保存関数（強制バックアップ付き）
  const manualSave = useCallback(async (
    elements: NonDeletedExcalidrawElement[],
    appState: any,
    files: any
  ) => {
    // console.log(`[Manual Save] Executing manual save with forced backup (elements: ${elements.length})`);

    // 既存のperformSave関数を使用して手動保存を実行
    await performSave(elements, appState, files, true); // 強制バックアップフラグを渡す
    showSaveNotification('保存しました');
  }, [performSave, showSaveNotification]);

  // ショートカット用の保存ハンドラ
  const handleSaveShortcut = useCallback(() => {
    if (excalidrawAPI) {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      manualSave(elements, appState, files);
    }
  }, [excalidrawAPI, manualSave]);

  // カスタムキーボードショートカット機能を追加
  useKeyboardShortcuts({
    excalidrawAPI,
    viewportCoordsToSceneCoords,
    onSave: handleSaveShortcut,
  });

  // ページを離れる前に未保存の変更を警告する
  // useEffect(() => {
  //   const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  //     if (excalidrawAPI && isSignificantChange(excalidrawAPI.getSceneElements())) {
  //       // 未保存の変更がある場合、ブラウザ標準の確認ダイアログを表示
  //       event.preventDefault();
  //       event.returnValue = ''; // 古いブラウザ向けの互換性設定
  //     }
  //   };

  //   window.addEventListener('beforeunload', handleBeforeUnload);

  //   return () => {
  //     window.removeEventListener('beforeunload', handleBeforeUnload);
  //   };
  // }, [excalidrawAPI, isSignificantChange]);

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
        onLinkOpen: (
          element: NonDeletedExcalidrawElement,
          event: CustomEvent<{ nativeEvent: MouseEvent | React.PointerEvent<HTMLCanvasElement> }>,
        ) => {
          // 付箋のリンククリック処理をカスタマイズ
          if (element.link) {
            event.preventDefault();
            const nativeEvent = event.detail?.nativeEvent;
            if (nativeEvent) {
              nativeEvent.preventDefault();
              nativeEvent.stopPropagation();
            }
            void handleStickyNoteLink(element.link, getCurrentFolder() ?? undefined);
          }
        },
        uiOptions: {
          canvasActions: {
            saveAs: false,
            saveToActiveFile: false,
          },
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
            onClick={() => void showNewFileDialog(getCurrentFolder())}
            title="新規作成"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button
            className="header-btn open-file-btn"
            onClick={handleOpenFileButtonClick}
            title="ファイルを開く"
            aria-label="ファイルを開く"
            disabled={isFileBrowserLoading || isFileBrowserOpen}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
              <polyline points="14 3 20 3 20 9" />
              <path d="M15 13h6" />
              <path d="M17.5 16.5 21 13 17.5 9.5" />
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
            className="header-btn open-explorer-btn"
            onClick={() => openInFileExplorer(getCurrentFolder())}
            title="フォルダを開く"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7h5l2 3h11a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
              <polyline points="13 12 16 15 21 10" />
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

      {isFileBrowserOpen && (
        <div className="file-browser-overlay" onClick={closeFileBrowser}>
          <div className="file-browser-window" onClick={(event) => event.stopPropagation()}>
            <div className="file-browser-titlebar">
              <span>開く</span>
              <button
                type="button"
                className="file-browser-titlebar-close"
                onClick={closeFileBrowser}
                aria-label="ファイル選択を閉じる"
              >
                ×
              </button>
            </div>
            <div className="file-browser-toolbar">
              <div className="file-browser-toolbar-buttons">
                <button
                  type="button"
                  title="上へ"
                  onClick={() => handleDirectoryNavigate(fileBrowserParentPath)}
                  disabled={!fileBrowserParentPath || isFileBrowserLoading}
                  aria-label="親フォルダへ"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="7 11 12 6 17 11" />
                    <line x1="12" y1="6" x2="12" y2="20" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="更新"
                  onClick={() => fetchDirectoryContents(fileBrowserPath)}
                  disabled={isFileBrowserLoading}
                  aria-label="再読み込み"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="1 4 1 10 7 10" />
                    <polyline points="23 20 23 14 17 14" />
                    <path d="M20.49 9A9 9 0 0 0 6.83 5.17L1 10" />
                    <path d="M3.51 15A9 9 0 0 0 17.17 18.83L23 14" />
                  </svg>
                </button>
              </div>
              <div className="file-browser-location">
                <label htmlFor="file-browser-location-input">場所:</label>
                <input
                  id="file-browser-location-input"
                  type="text"
                  value={displayPathValue}
                  readOnly
                />
              </div>
            </div>
            <div className="file-browser-content">
              {fileBrowserError && (
                <div className="file-browser-message error">{fileBrowserError}</div>
              )}
              <div className="file-browser-table">
                <div className="file-browser-table-header">
                  <span className="column name">名前</span>
                  <span className="column modified">更新日時</span>
                  <span className="column type">種類</span>
                  <span className="column size">サイズ</span>
                </div>
                <div className="file-browser-table-body">
                  {isFileBrowserLoading ? (
                    <div className="file-browser-message">読み込み中...</div>
                  ) : fileBrowserEntries.length === 0 ? (
                    <div className="file-browser-message">このフォルダには項目がありません。</div>
                  ) : (
                    fileBrowserEntries.map((entry) => {
                      const isSelected = fileBrowserSelectedEntry?.path === entry.path;
                      const classNames = [
                        'file-browser-row',
                        entry.isDir ? 'is-dir' : 'is-file',
                        isSelected ? 'is-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <button
                          key={entry.path}
                          type="button"
                          className={classNames}
                          onClick={() => handleEntryClick(entry)}
                          onDoubleClick={() => handleEntryDoubleClick(entry)}
                          onKeyDown={(event) => handleEntryKeyDown(event, entry)}
                          aria-selected={isSelected}
                        >
                          <span className="column name" title={entry.name}>
                            <svg
                              className="entry-icon"
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                            >
                              {entry.isDir ? (
                                <path d="M3 7h5l2 3h11a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
                              ) : (
                                <>
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14,2 14,8 20,8" />
                                </>
                              )}
                            </svg>
                            <span className="entry-name">{entry.name}</span>
                          </span>
                          <span className="column modified">
                            {formatModified(entry.modified ?? null)}
                          </span>
                          <span className="column type">{getTypeLabel(entry)}</span>
                          <span className="column size">{entry.isDir ? '' : formatSize(entry.size ?? null)}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            <div className="file-browser-footer">
              <div className="file-browser-field">
                <label htmlFor="file-browser-file-name">ファイル名(N):</label>
                <input
                  id="file-browser-file-name"
                  type="text"
                  value={fileBrowserInputValue}
                  onChange={(event) => {
                    setFileBrowserInputValue(event.target.value);
                    setFileBrowserError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleFileBrowserConfirm();
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="file-browser-field">
                <label htmlFor="file-browser-file-type">ファイルの種類(T):</label>
                <select id="file-browser-file-type" value="excalidraw" disabled>
                  <option value="excalidraw">Excalidraw ファイル (*.excalidraw)</option>
                  <option value="all">すべてのファイル (*.*)</option>
                </select>
              </div>
              <div className="file-browser-footer-buttons">
                <button type="button" onClick={handleFileBrowserConfirm} disabled={openButtonDisabled}>
                  開く(O)
                </button>
                <button type="button" onClick={closeFileBrowser}>
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="excalidraw-wrapper" ref={containerRef}>
        {renderExcalidraw(children)}
      </div>
    </div>
  );
}
