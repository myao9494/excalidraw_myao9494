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

export const getFilePathFromUrl = (): string | null => {
  const urlParams = new URLSearchParams(window.location.search);
  const rawFilepath = urlParams.get('filepath');
  
  if (!rawFilepath) {
    return null;
  }
  
  try {
    // 明示的にデコードを行う（ダブルクォートなどの特殊文字に対応）
    const decodedFilepath = decodeURIComponent(rawFilepath);
    console.log('[DEBUG] Original filepath param:', rawFilepath);
    console.log('[DEBUG] Decoded filepath:', decodedFilepath);
    return decodedFilepath;
  } catch (error) {
    console.warn('Failed to decode filepath, using original:', error);
    return rawFilepath;
  }
};

const getApiBaseUrl = (): string => {
  // 現在のホストを取得し、バックエンドポート(8008)を使用
  const currentHost = window.location.hostname;
  const baseUrl = `http://${currentHost}:8008`;
  console.log(`[DEBUG] API Base URL: ${baseUrl} (hostname: ${currentHost})`);
  return baseUrl;
};

const API_BASE_URL = getApiBaseUrl();

const SVG_NS = 'http://www.w3.org/2000/svg';

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

export const loadExcalidrawFile = async (filePath: string): Promise<{ data: ExcalidrawFileData; modified: number } | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/load-file?filepath=${encodeURIComponent(filePath)}`);
    
    if (response.status === 404) {
      // ファイルが存在しない場合はnullを返す
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error loading file:', error);
    return null;
  }
};

export const getFileInfo = async (filePath: string): Promise<{ modified: number; exists: boolean } | null> => {
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
    console.error('Error getting file info:', error);
    return null;
  }
};

export const saveExcalidrawFile = async (filePath: string, data: ExcalidrawFileData, forceBackup: boolean = false): Promise<boolean> => {
  try {
    const saveUrl = `${API_BASE_URL}/api/save-file`;
    console.log(`[DEBUG] Saving file to: ${saveUrl}`);
    console.log(`[DEBUG] File path: ${filePath}`);
    console.log(`[DEBUG] Force backup: ${forceBackup}`);
    
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
      return false;
    }
    
    console.log('File saved successfully:', result.message);
    return true;
  } catch (error) {
    console.error('Error saving file:', error);
    return false;
  }
};

export const uploadFiles = async (
  files: File[], 
  currentPath: string, 
  fileType: string = 'general'
): Promise<{ success: boolean; files?: Array<{name: string; path: string; size: number}>; error?: string }> => {
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
  const extension = filePath.toLowerCase().split('.').pop();
  return extension === 'excalidraw';
};

/**
 * 付箋のリンククリック処理
 * Excalidrawファイル以外は外部ファイルビューアーにリダイレクト
 */
export const handleStickyNoteLink = (linkUrl: string): void => {
  try {
    // URLの場合はそのまま開く
    if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
      window.open(linkUrl, '_blank');
      return;
    }

    // ファイルパスの場合
    if (isExcalidrawFile(linkUrl)) {
      // Excalidrawファイルの場合は現在のアプリで開く
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('filepath', linkUrl);
      window.location.href = currentUrl.toString();
    } else {
      // Excalidraw以外のファイルは外部ファイルビューアーの/fullpathエンドポイントで開く
      // URLエンコードせずに、クエリパラメータとして直接渡す
      const currentHost = window.location.hostname;
      const fileViewerUrl = `http://${currentHost}:5001/fullpath?path=${linkUrl}`;
      window.open(fileViewerUrl, '_blank');
    }
  } catch (error) {
    console.error('Error handling sticky note link:', error);
    // エラーの場合は元のリンクをそのまま開く
    window.open(linkUrl, '_blank');
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
