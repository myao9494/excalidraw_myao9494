/**
 * ブラウザタブタイトル生成用のユーティリティ関数
 * ファイルパスから2つ上の親フォルダまでを"-"で繋げた文字列を生成する
 */

/**
 * ファイルパスからタブタイトルを生成する
 * @param filePath ファイルパス (例: /Users/sudoupousei/000_work/excalidraw_myao9494/personal/top.excalidraw)
 * @returns タブタイトル (例: top-personal-excalidraw_myao9494)
 */
export function generateTabTitle(filePath: string | null): string {
  if (!filePath) {
    return "Excalidraw";
  }

  // パスを正規化（バックスラッシュをスラッシュに変換）
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // パスを分割
  const pathParts = normalizedPath.split('/').filter(part => part.length > 0);
  
  if (pathParts.length === 0) {
    return "Excalidraw";
  }
  
  // ファイル名（最後の要素）から拡張子を削除
  const fileName = pathParts[pathParts.length - 1];
  const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  
  // ファイルから見て2つ上までの親フォルダを取得
  const parentParts: string[] = [];
  
  // 最大2つの親フォルダを取得（ファイル名を除く）
  for (let i = Math.max(0, pathParts.length - 3); i < pathParts.length - 1; i++) {
    parentParts.push(pathParts[i]);
  }
  
  // ファイル名（拡張子なし）から始まって、親フォルダを逆順で繋げる
  const titleParts = [fileNameWithoutExt, ...parentParts.reverse()];
  
  return titleParts.join('-');
}