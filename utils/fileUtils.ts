import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import { exportToSvg } from "@excalidraw/excalidraw";


export interface ExcalidrawFileData {
  type: string;
  version: number;
  source: string;
  elements: NonDeletedExcalidrawElement[];
  appState: Partial<AppState>;
  files?: any;
}

/**
 * JSON読み込みエラーの詳細情報
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: string;
}

export interface JsonErrorResponse {
  error_type: 'json_syntax' | 'validation' | 'schema';
  message: string;
  line?: number;
  column?: number;
  context?: string;
  details?: ValidationErrorDetail[];
}

export interface LoadFileError {
  status: number;
  error: JsonErrorResponse;
}

export interface LoadFileResponse {
  data: ExcalidrawFileData;
  hash: string;
  modified?: number;
}

export interface FileInfoResponse {
  exists: boolean;
  hash?: string;
  modified?: number;
}

export interface SaveFileResponse {
  success: boolean;
  message?: string;
  modified?: number;
  hash?: string;
}

export interface ArchiveFileResponse {
  success: boolean;
  archivedPath?: string;
  message?: string;
  error?: string;
}

export const getFilePathFromUrl = (): string | null => {
  const urlParams = new URLSearchParams(window.location.search);
  const rawFilepath = urlParams.get('filepath');

  if (!rawFilepath) {
    return null;
  }

  try {
    // 明示的にデコードを行う（ダブルクォートなどの特殊文字に対応）
    const decodedFilepath = decodeURIComponent(rawFilepath);
    // console.log('[DEBUG] Original filepath param:', rawFilepath);
    // console.log('[DEBUG] Decoded filepath:', decodedFilepath);
    return decodedFilepath;
  } catch (error) {
    console.warn('Failed to decode filepath, using original:', error);
    return rawFilepath;
  }
};

const getApiBaseUrl = (): string => {
  // @ts-ignore
  if (import.meta.env?.DEV) {
    const currentHost = window.location.hostname;
    // 開発環境（Vite port 3001）もバックエンドポート(3001)を指定
    return `http://${currentHost}:3001`;
  }
  // 本番環境（ビルド後）はバックエンドから同一オリジンで配信されているため相対パス
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

interface BackendRunCommandResponse {
  success: boolean;
  command: string;
  pid?: number;
  error?: string;
}

export interface BackendOpenFileResponse {
  success: boolean;
  targetType?: string;
  resolvedPath?: string;
  message?: string;
}


const normalizeFolderPath = (rawPath: string): string => {
  // Windowsの区切り文字も考慮してスラッシュに統一
  return rawPath.replace(/\\/g, '/');
};

/**
 * バックエンド（localhost:8001）が利用可能かチェックする
 * @param timeoutMs タイムアウト（ミリ秒）
 */
export const checkBackendAvailable = async (timeoutMs: number = 500): Promise<boolean> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // localhost:8001 は HEAD / を返さない構成があるため、
    // 応答可否の確認は GET /api/config で行う。
    await fetch('http://localhost:8001/api/config', {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch (error) {
    // タイムアウトや接続拒否などの場合はfalse
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};

const resolveFolderFromUrlParam = (): string | undefined => {
  const filePath = getFilePathFromUrl();
  if (!filePath) {
    return undefined;
  }

  const normalizedPath = normalizeFolderPath(filePath);
  const lastSlashIndex = normalizedPath.lastIndexOf('/');

  if (lastSlashIndex <= 0) {
    return undefined;
  }

  return normalizedPath.substring(0, lastSlashIndex);
};

export const runCommandViaBackend = async (
  command: string,
  folderPath?: string  // ← 渡されなかったら自動で決定
): Promise<boolean> => {
  try {
    // HTMLエンティティをデコード（例: &quot; → "）
    const decodedCommand = command.replace(/&quot;/g, '"');

    // 🔽 カレントフォルダが未指定なら、現在のExcalidrawファイルパスから取得
    const resolvedFolderPath = folderPath && folderPath.trim().length > 0
      ? normalizeFolderPath(folderPath)
      : resolveFolderFromUrlParam();

    console.log('[DEBUG] Running command:', decodedCommand);
    console.log('[DEBUG] Working directory:', resolvedFolderPath ?? '(not provided)');

    const response = await fetch(`${API_BASE_URL}/api/run-command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command: decodedCommand,
        working_directory: resolvedFolderPath || '',  // FastAPIのRunCommandRequestに合わせる
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = (await response.json()) as BackendRunCommandResponse;

    if (!result.success) {
      throw new Error(result.error || 'Backend reported command execution failure');
    }

    return true;
  } catch (error) {
    console.error('Error executing command via backend:', error);
    if (typeof window !== 'undefined' && window.alert) {
      window.alert('コマンドを実行できませんでした。コマンドの形式を確認してください。');
    }
    return false;
  }
};

/**
 * 従来のバックエンド（port 3001等）を経由してファイルを開く
 * localhost:8001 が使えない場合のフォールバック用
 */
export const openFileViaBackend = async (filePath: string): Promise<BackendOpenFileResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/open-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filepath: filePath }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return (await response.json()) as BackendOpenFileResponse;
  } catch (error) {
    console.error('Error opening file via backend:', error);
    throw error;
  }
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const CMD_LINK_PATTERN = /^cmd(\s|$)/i;

const isTransparentFill = (shape: SVGGraphicsElement): boolean => {
  const fill = shape.getAttribute('fill');
  if (!fill || fill === 'none') {
    return true;
  }

  const fillOpacityAttr = shape.getAttribute('fill-opacity');
  const opacityAttr = shape.getAttribute('opacity');

  let fillOpacity = fillOpacityAttr !== null ? parseFloat(fillOpacityAttr) : 1;
  let opacity = opacityAttr !== null ? parseFloat(opacityAttr) : 1;

  if (Number.isNaN(fillOpacity)) {
    fillOpacity = 1;
  }
  if (Number.isNaN(opacity)) {
    opacity = 1;
  }

  return fillOpacity * opacity === 0;
};

const mergeAdjacentTextAnchors = (svg: SVGSVGElement): void => {
  const anchors = Array.from(svg.querySelectorAll<SVGAElement>('a[href]'));

  const isTextGroup = (element: Element | null): element is SVGGElement => {
    return element instanceof SVGGElement && !!element.querySelector('text');
  };

  anchors.forEach(anchor => {
    if (anchor.querySelector('text')) {
      return;
    }

    const href = anchor.getAttribute('href');
    if (!href) {
      return;
    }

    let sibling = anchor.nextElementSibling;
    while (sibling) {
      if (sibling instanceof SVGAElement) {
        if (sibling.getAttribute('href') !== href) {
          break;
        }

        const textGroup = Array.from(sibling.children).find(child => child instanceof SVGGElement) as SVGGElement | undefined;
        if (textGroup && textGroup.querySelector('text')) {
          anchor.appendChild(textGroup);
        }

        const remainingChildren = sibling.childNodes.length;
        sibling.remove();

        if (remainingChildren === 0) {
          break;
        }

        sibling = anchor.nextElementSibling;
        continue;
      }

      if (isTextGroup(sibling)) {
        anchor.appendChild(sibling);
        sibling = anchor.nextElementSibling;
        continue;
      }

      break;
    }
  });
};

const addClickableOverlays = (svg: SVGSVGElement): void => {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }

  const anchors = Array.from(svg.querySelectorAll<SVGAElement>('a[href]'));
  if (anchors.length === 0) {
    return;
  }

  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.width = '0';
  tempContainer.style.height = '0';
  tempContainer.style.overflow = 'hidden';
  tempContainer.style.opacity = '0';
  tempContainer.style.pointerEvents = 'none';
  document.body.appendChild(tempContainer);

  const originalParent = svg.parentNode;
  tempContainer.appendChild(svg);

  anchors.forEach(anchor => {
    if (anchor.querySelector(':scope > rect[data-excalidraw-overlay="true"]')) {
      return;
    }

    const hasText = !!anchor.querySelector('text');
    const shapes = Array.from(anchor.querySelectorAll<SVGGraphicsElement>('path, rect, ellipse, circle, polygon, polyline'));
    const needsOverlay = hasText || shapes.some(isTransparentFill);

    if (!needsOverlay) {
      return;
    }

    let bbox: DOMRect;
    try {
      bbox = anchor.getBBox();
    } catch (error) {
      return;
    }

    if (!bbox.width || !bbox.height) {
      return;
    }

    const overlay = svg.ownerDocument.createElementNS(SVG_NS, 'rect');
    overlay.setAttribute('x', bbox.x.toString());
    overlay.setAttribute('y', bbox.y.toString());
    overlay.setAttribute('width', bbox.width.toString());
    overlay.setAttribute('height', bbox.height.toString());
    overlay.setAttribute('fill', '#ffffff');
    overlay.setAttribute('fill-opacity', '0');
    overlay.setAttribute('stroke', 'none');
    overlay.setAttribute('pointer-events', 'fill');
    overlay.setAttribute('data-excalidraw-overlay', 'true');

    const firstElementChild = anchor.firstElementChild;
    if (firstElementChild && firstElementChild.tagName.toLowerCase() === 'mask') {
      anchor.insertBefore(overlay, firstElementChild.nextSibling);
    } else {
      anchor.insertBefore(overlay, firstElementChild || null);
    }
  });

  tempContainer.removeChild(svg);
  if (originalParent instanceof Element) {
    originalParent.appendChild(svg);
  }
  tempContainer.remove();
};

const enhanceSvgLinks = (svg: SVGSVGElement | null): void => {
  if (!svg) {
    return;
  }

  mergeAdjacentTextAnchors(svg);
  addClickableOverlays(svg);
};

export const loadExcalidrawFile = async (filePath: string): Promise<LoadFileResponse | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/load-file?filepath=${encodeURIComponent(filePath)}`);

    if (response.status === 404) {
      // ファイルが存在しない場合はnullを返す
      return null;
    }

    if (!response.ok) {
      // エラーレスポンスの詳細を取得
      let errorDetail: JsonErrorResponse;
      try {
        const errorData = await response.json();
        // detailフィールドにJsonErrorResponseが含まれている
        errorDetail = typeof errorData.detail === 'string'
          ? { error_type: 'schema', message: errorData.detail }
          : errorData.detail;
      } catch {
        errorDetail = {
          error_type: 'schema',
          message: `HTTP error! status: ${response.status}`
        };
      }

      // エラーをスローして上位で処理
      throw {
        status: response.status,
        error: errorDetail
      } as LoadFileError;
    }

    const result = await response.json();
    return result;
  } catch (error) {
    // LoadFileErrorの場合は再スロー
    if (error && typeof error === 'object' && 'status' in error && 'error' in error) {
      throw error;
    }

    console.error('Error loading file:', error);

    // ネットワークエラーなど予期しないエラー
    throw {
      status: 500,
      error: {
        error_type: 'schema',
        message: error instanceof Error ? error.message : 'ファイルの読み込みに失敗しました'
      }
    } as LoadFileError;
  }
};

interface GetFileInfoOptions {
  silent?: boolean;
}

export const getFileInfo = async (
  filePath: string,
  options?: GetFileInfoOptions,
): Promise<FileInfoResponse | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/file-info?filepath=${encodeURIComponent(filePath)}`);

    if (response.status === 404) {
      return { modified: 0, exists: false };
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    if (!options?.silent) {
      console.error('Error getting file info:', error);
    }
    return null;
  }
};

export const saveExcalidrawFile = async (
  filePath: string,
  data: ExcalidrawFileData,
  forceBackup: boolean = false
): Promise<SaveFileResponse | null> => {
  try {
    const saveUrl = `${API_BASE_URL}/api/save-file`;
    // console.log(`[DEBUG] Saving file to: ${saveUrl}`);
    // console.log(`[DEBUG] File path: ${filepath}`);
    // console.log(`[DEBUG] Force backup: ${forceBackup}`);

    const response = await fetch(saveUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filepath: filePath,
        data: data,
        force_backup: forceBackup
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result?.success) {
      const message = result?.message || 'File save skipped by server.';
      console.warn('File save skipped:', message);
      return {
        success: false,
        message,
      };
    }

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] File saved successfully:`, result.message);
    return result;
  } catch (error) {
    console.error('Error saving file:', error);
    return null;
  }
};

export const uploadFiles = async (
  files: File[],
  currentPath: string,
  fileType: string = 'general'
): Promise<{ success: boolean; files?: Array<{ name: string; path: string; size: number }>; error?: string }> => {
  try {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('current_path', currentPath);
    formData.append('file_type', fileType);

    const response = await fetch(`${API_BASE_URL}/api/upload-files`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error uploading files:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export const createFolderShortcut = async (
  folderPath: string,
  currentPath: string
): Promise<{ success: boolean; folderPath?: string; error?: string }> => {
  try {
    const formData = new FormData();
    formData.append('folder_path', folderPath);
    formData.append('current_path', currentPath);

    const response = await fetch(`${API_BASE_URL}/api/create-folder-shortcut`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error creating folder shortcut:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export const saveEmail = async (
  emailData: string,
  subject: string,
  currentPath: string
): Promise<{ success: boolean; savedPath?: string; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/save-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        emailData,
        subject,
        currentPath
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error saving email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * ファイルパスがExcalidrawファイルかどうかを判定
 */
export const isExcalidrawFile = (filePath: string): boolean => {
  if (!filePath) return false;
  const pathLower = filePath.toLowerCase();
  return pathLower.endsWith('.excalidraw') || pathLower.endsWith('.excalidraw.md');
};

/**
 * パスがObsidianフォルダ内にあるかを判定
 * 簡易的にパスに 'obsidian' が含まれるかで判定
 */
export const isObsidianPath = (filePath: string): boolean => {
  if (!filePath) return false;
  return filePath.toLowerCase().includes('obsidian');
};

/**
 * 相対パスかどうかを判定
 */
const isRelativePath = (path: string): boolean => {
  // 絶対パスの判定（Unix: /で始まる, Windows: C:\など）
  if (path.startsWith('/')) return false;
  if (/^[a-zA-Z]:[\\/]/.test(path)) return false;
  // URL形式は除外
  if (path.startsWith('http://') || path.startsWith('https://')) return false;
  if (path.startsWith('obsidian://')) return false;
  // その他は相対パスとみなす
  return true;
};

/**
 * 相対パスを絶対パスに変換
 */
const resolveRelativePath = (relativePath: string, currentFolder: string): string => {
  // currentFolderをスラッシュで正規化
  const normalizedFolder = currentFolder.replace(/\\/g, '/');
  const normalizedRelative = relativePath.replace(/\\/g, '/');

  // 相対パスの各セグメントを処理
  const folderParts = normalizedFolder.split('/').filter(p => p !== '');
  const relativeParts = normalizedRelative.split('/');

  for (const part of relativeParts) {
    if (part === '..') {
      // 親ディレクトリへ移動
      folderParts.pop();
    } else if (part !== '.' && part !== '') {
      // 通常のディレクトリ/ファイル名を追加
      folderParts.push(part);
    }
  }

  // Unix形式の絶対パスを構築
  // 元のフォルダがスラッシュで始まっていた場合は先頭にスラッシュを追加
  const prefix = normalizedFolder.startsWith('/') ? '/' : '';
  return prefix + folderParts.join('/');
};

/**
 * 付箋のリンククリック処理
 * Excalidrawファイル以外は外部ファイルビューアーにリダイレクト
 */
export const handleStickyNoteLink = async (linkUrl: string, currentFolder?: string): Promise<void> => {
  try {
    // HTMLエンティティをデコード（&quot; → "）
    let trimmedLink = linkUrl.trim().replace(/&quot;/g, '"');

    if (CMD_LINK_PATTERN.test(trimmedLink)) {
      await runCommandViaBackend(trimmedLink, currentFolder); // ← フォルダを渡す
      return;
    }

    // Obsidian URLスキームの場合はバックエンド経由で開く
    if (trimmedLink.startsWith('obsidian://')) {
      try {
        const encodedUrl = encodeURIComponent(trimmedLink);
        const response = await fetch(`${API_BASE_URL}/api/open-url?url=${encodedUrl}`);

        if (response.ok) {
          const result = await response.json();
          console.log('Obsidianで開きました:', result.url);
        } else {
          console.error('Obsidian URLを開けませんでした:', response.status);
          if (typeof window !== 'undefined' && window.alert) {
            window.alert('Obsidianを開くことができませんでした。');
          }
        }
      } catch (error) {
        console.error('Error opening Obsidian URL:', error);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Obsidianを開く際にエラーが発生しました。');
        }
      }
      return;
    }

    // URLの場合はそのまま開く
    if (trimmedLink.startsWith('http://') || trimmedLink.startsWith('https://')) {
      window.open(trimmedLink, '_blank');
      return;
    }

    // 相対パスの場合は絶対パスに変換
    if (isRelativePath(trimmedLink) && currentFolder) {
      const absolutePath = resolveRelativePath(trimmedLink, currentFolder);
      console.log(`[Link] Resolved relative path: ${trimmedLink} -> ${absolutePath}`);
      trimmedLink = absolutePath;
    }

    // ファイルパスの場合
    if (isExcalidrawFile(trimmedLink)) {
      // Excalidrawファイルの場合は現在のアプリで開く
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('filepath', trimmedLink);
      window.open(currentUrl.toString(), '_blank', 'noopener');
    } else {
      // Excalidraw以外のファイルはlocalhost:8001のAPI経由で開く
      // http://localhost:8001/api/open-path?path={ファイルフルパス または フォルダフルパス}
      try {
        const encodedPath = encodeURIComponent(trimmedLink);
        const openUrl = `http://localhost:8001/api/open-path?path=${encodedPath}`;

        // ポップアップブロッカー回避のため、先にウィンドウを開く
        const newWindow = window.open('about:blank', '_blank');

        if (newWindow) {
          // サーバーの稼働確認を行ってからリダイレクト先を決定
          checkBackendAvailable().then((isAvailable) => {
            if (isAvailable) {
              newWindow.location.href = openUrl;
            } else {
              // バックエンドがダウンしている場合は、従来のリンク（ローカルパスなど）をそのまま開く
              console.warn('Backend (localhost:8001) is down. Fallback to internal backend.');

              // New fallback: internal backend call
              openFileViaBackend(trimmedLink).then(() => {
                // Success - close the blank window as system handler took over
                newWindow.close();
              }).catch(err => {
                console.error('Fallback to internal backend also failed:', err);
                // Final fallback: try to open raw link in the window
                newWindow.location.href = trimmedLink;
              });
            }
          });
        }
      } catch (error) {
        console.error('Error opening file via localhost:8001:', error);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('ファイルを開く処理中にエラーが発生しました。');
        }
      }
    }
  } catch (error) {
    console.error('Error handling sticky note link:', error);
    if (typeof window !== 'undefined' && window.alert) {
      window.alert('リンクの処理中にエラーが発生しました。');
    }
  }
};

/**
 * SVGファイルとして保存する関数
 * @param elements 選択された要素または全要素
 * @param appState アプリケーションの状態
 * @param files ファイルデータ
 * @param currentFolder 現在のフォルダパス
 * @param selectedElements 選択された要素（nullの場合は全要素）
 */
export const exportToSvgFile = async (
  elements: NonDeletedExcalidrawElement[],
  appState: AppState,
  files: any,
  currentFolder: string | null,
  selectedElements: NonDeletedExcalidrawElement[] | null = null
): Promise<boolean> => {
  try {
    // ファイル名を入力させる
    const fileName = prompt('SVGファイル名を入力してください（拡張子なし）:');
    if (!fileName || !fileName.trim()) {
      return false;
    }

    // 選択された要素がある場合はそれを使用、なければ全要素を使用
    const baseElementsForExport = selectedElements && selectedElements.length > 0 ? selectedElements : elements;

    // 付箋のテキストが含まれるように、containerIdを持つテキスト要素も含める
    let elementsToExport: NonDeletedExcalidrawElement[] = baseElementsForExport;
    if (selectedElements && selectedElements.length > 0) {
      const selectedIds = new Set(selectedElements.map(el => el.id));
      const relatedTextElements = elements.filter(element =>
        element.type === 'text' &&
        element.containerId &&
        selectedIds.has(element.containerId)
      );

      // 関連するテキスト要素を追加
      const additionalTextElements = relatedTextElements.filter(textEl => !selectedIds.has(textEl.id));
      elementsToExport = [...selectedElements, ...additionalTextElements];

      console.log('Added related text elements:', additionalTextElements.length);
    }

    // エクスポート用にクローンを作成（オリジナルを汚さないため）
    const elementsForSvg = elementsToExport.map(element => ({ ...element }));

    // コンテナにリンクがある場合は、紐づくテキスト要素にも同じリンクを設定
    const elementCloneMap = new Map(elementsForSvg.map(element => [element.id, element]));
    const originalElementMap = new Map(elements.map(element => [element.id, element]));

    elementsForSvg.forEach(clone => {
      if (!clone.link) {
        return;
      }

      const original = originalElementMap.get(clone.id);
      if (!original) {
        return;
      }

      const boundTexts = elements.filter(element => element.type === 'text' && element.containerId === original.id);
      boundTexts.forEach(boundText => {
        const textClone = elementCloneMap.get(boundText.id);
        if (textClone && !textClone.link) {
          textClone.link = clone.link;
        }
      });
    });

    // SVGを生成（改善版）
    const svg = await exportToSvg({
      elements: elementsForSvg,
      appState: {
        ...appState,
        exportBackground: true,
        exportWithDarkMode: false,
        exportEmbedScene: false,
        // フォント関連の設定を保持
        currentItemFontFamily: appState.currentItemFontFamily || 1, // デフォルトフォント
        currentItemFontSize: appState.currentItemFontSize || 20,
        // テキストの可視性を確保
        currentItemStrokeColor: appState.currentItemStrokeColor || '#000000',
        currentItemOpacity: appState.currentItemOpacity || 100,
      },
      files,
      exportPadding: 10,
      metadata: "" // 必要に応じてメタデータを追加
    });

    // SVGをテキストとして取得
    enhanceSvgLinks(svg);
    const svgString = new XMLSerializer().serializeToString(svg);

    // デバッグ用：SVG内容を確認
    console.log('Generated SVG contains font data:', svgString.includes('@font-face'));
    console.log('Text elements count:', elementsForSvg.filter(e => e.type === 'text').length);
    console.log('Elements to export:', elementsForSvg.length);

    // ファイルパスを構築
    const normalizedFolder = currentFolder ? currentFolder.replace(/\\/g, '/') : '.';
    const filePath = `${normalizedFolder}/${fileName.trim()}.svg`;

    // バックエンドに保存
    const response = await fetch(`${API_BASE_URL}/api/save-svg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filepath: filePath,
        svg_content: svgString
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('SVG file saved successfully:', result.message);
    return true;
  } catch (error) {
    console.error('Error saving SVG file:', error);
    return false;
  }
};

/**
 * JsonErrorResponseをユーザー向けメッセージに整形
 */
export function formatJsonError(error: JsonErrorResponse): string {
  let message = error.message;

  // JSON構文エラーの場合
  if (error.error_type === 'json_syntax') {
    if (error.line && error.column) {
      message += `\n\n行 ${error.line}, カラム ${error.column}`;
    }
    if (error.context) {
      message += `\n\nエラー箇所:\n${error.context}`;
    }
  }

  // バリデーションエラーの場合
  if (error.error_type === 'validation' && error.details && error.details.length > 0) {
    message += '\n\n詳細:';
    error.details.forEach((detail, idx) => {
      message += `\n${idx + 1}. ${detail.field}`;
      message += `\n   ${detail.message}`;
      if (detail.value) {
        message += `\n   値: ${detail.value}`;
      }
    });
  }

  return message;
}

/**
 * ファイルをアーカイブ（バックアップフォルダへ移動）する
 */
export const archiveFile = async (
  filePath: string
): Promise<ArchiveFileResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/archive-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filepath: filePath
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error archiving file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * LoadFileErrorをユーザー向けメッセージに整形
 */
export function formatLoadFileError(loadError: LoadFileError): string {
  return formatJsonError(loadError.error);
}
