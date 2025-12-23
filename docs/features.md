# 機能仕様書

## 1. キーボードショートカット機能

### 1.1 図形作成ショートカット

#### 矢印なし直線作成 (`C`キー)
**機能概要**
- 矢印ツールを選択し、矢印ヘッドを無効化した直線の描画を可能にする

**動作詳細**
1. `C`キーを押下
2. 矢印ツールが自動選択される
3. 開始矢印ヘッドと終了矢印ヘッドが無効化される
4. 直線の描画が可能になる

**技術実装**
```typescript
excalidrawAPI.setActiveTool({ type: "arrow" });
excalidrawAPI.updateScene({
  appState: {
    currentItemStartArrowhead: null,
    currentItemEndArrowhead: null,
  },
});
```

### 1.2 付箋作成ショートカット

#### 基本付箋作成 (`N`キー)
**機能概要**
- マウス位置に黄色背景の基本付箋を作成

**動作詳細**
1. `N`キーを押下
2. 現在のマウス位置を取得
3. ビューポート座標をシーン座標に変換
4. 黄色背景の矩形とテキスト要素を作成
5. テキストが自動選択される

**スタイル仕様**
- 背景色: `#fef3bd`（黄色）
- サイズ: 200×50px
- テキスト: 「メモを入力」プレースホルダー

#### クリップボード付箋作成 (`W`キー)
**機能概要**
- クリップボードの内容を読み取り、適切な形式で付箋を作成

**動作詳細**
1. `W`キーを押下
2. クリップボードの内容を非同期で読み取り
3. 内容に応じて表示テキストとリンクを決定
4. 付箋要素を作成

**クリップボード処理ロジック**
```typescript
// ファイルパスの場合
if (text.includes('/') || text.includes('\\')) {
  const fileName = text.split(/[/\\]/).pop();
  const extension = fileName?.split('.').pop();
  
  // Python ファイル
  if (extension === 'py') {
    displayText = `cmd python ${fileName}`;
  }
  // Shell/Batch ファイル
  else if (extension === 'sh' || extension === 'bat') {
    displayText = `cmd ${fileName}`;
  }
  // 通常のファイル
  else {
    displayText = fileName;
  }
}
```

### 1.3 レイヤー操作ショートカット

#### 最前面移動 (`Cmd/Ctrl + M`)
**機能概要**
- 選択した要素とその関連テキストを最前面に移動

**動作詳細**
1. `Cmd/Ctrl + M`キーを押下
2. 選択中の要素を取得
3. 関連するテキスト要素を特定
4. 全要素を最前面に移動

#### 最背面移動 (`Cmd/Ctrl + B`)
**機能概要**
- 選択した要素とその関連テキストを最背面に移動

**動作詳細**
1. `Cmd/Ctrl + B`キーを押下
2. 選択中の要素を取得
3. 関連するテキスト要素を特定
4. 全要素を最背面に移動

**技術実装**
```typescript
// 最前面移動
excalidrawAPI.updateScene({
  elements: newElements.map(el => ({ ...el, index: maxIndex++ }))
});

// 最背面移動
excalidrawAPI.updateScene({
  elements: newElements.map(el => ({ ...el, index: minIndex-- }))
});
```

## 2. ファイル操作機能

### 2.1 ファイル読み込み機能

#### URLパラメータによるファイル指定
**機能概要**
- URLパラメータ`filepath`でローカルファイルを指定し、自動読み込み

**URL形式**
```
http://localhost:3001/?filepath=/path/to/file.excalidraw
```

**動作詳細**
1. アプリケーション起動時にURLパラメータを解析
2. `filepath`パラメータからファイルパスを取得
3. バックエンドAPIを呼び出してファイルを読み込み
4. Excalidrawに表示

**API呼び出し**
```typescript
const response = await fetch(`${API_BASE_URL}/api/load-file?filepath=${encodeURIComponent(filePath)}`);
const result = await response.json();
```

### 2.2 自動保存機能

#### オブジェクト変更検知
**機能概要**
- オブジェクトに変更があった場合のみ自動保存を実行

**動作詳細**
1. Excalidrawの`onChange`イベントを監視
2. 要素の変更を検知（JSON文字列比較）
3. ポインタの移動は保存対象外
4. 変更があった場合のみ保存処理を実行

**変更検知ロジック**
```typescript
const currentElementsString = JSON.stringify(elements);
const hasElementsChanged = currentElementsString !== lastSavedElements;

if (hasElementsChanged) {
  // 保存処理実行
}
```

#### 標準Excalidrawファイル形式
**ファイル構造**
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [...],
  "appState": {...},
  "files": {...}
}
```

### 2.3 外部編集対応

#### ファイル更新監視
**機能概要**
- 5秒間隔で外部でのファイル更新を検知し、自動リロード

**動作詳細**
1. 5秒間隔で`/api/file-info`エンドポイントを呼び出し
2. ファイルの更新日時を取得
3. 前回の更新日時と比較
4. 更新があった場合はファイルを再読み込み
5. Excalidrawのシーンを更新

**監視ロジック**
```typescript
const checkFileUpdates = async () => {
  const fileInfo = await getFileInfo(currentFilePath);
  if (fileInfo.modified > lastFileModified) {
    // ファイルを再読み込み
    const fileResult = await loadExcalidrawFile(currentFilePath);
    excalidrawAPI.updateScene({
      elements: fileResult.data.elements,
      appState: fileResult.data.appState,
      files: fileResult.data.files,
    });
  }
};
```

## 3. バックアップ機能

### 3.1 自動バックアップ

#### 5分間隔制限
**機能概要**
- 最新バックアップから5分以上経過した場合のみバックアップを作成

**動作詳細**
1. ファイル保存時にバックアップ処理を実行
2. 既存のバックアップファイルから最新のものを特定
3. 最新バックアップの作成時刻を取得
4. 現在時刻との差分を計算
5. 5分（300秒）以上経過している場合のみバックアップを作成

**時間チェックロジック**
```python
current_time = time.time()
if latest_backup_time > 0 and (current_time - latest_backup_time) < 300:
    print(f"Skip backup: Last backup was {int(current_time - latest_backup_time)} seconds ago")
    return True
```

#### バックアップファイル管理
**ファイル命名規則**
- `{元ファイル名}_backup_{00-09}.excalidraw`
- 例: `myfile_backup_00.excalidraw`

**保存場所**
- 元ファイルと同じディレクトリの`backup/`フォルダ

### 3.2 バックアップローテーション

#### 10個上限管理
**機能概要**
- 最大10個のバックアップを保持し、古いものから上書き

**動作詳細**
1. 既存のバックアップファイル（00-09）を調査
2. 空いているスロットがあればそれを使用
3. 全てのスロットが埋まっている場合は最古のものを特定
4. 最古のバックアップファイルを上書き

**ローテーションロジック**
```python
for i in range(10):
    backup_path = backup_dir / f"{base_name}_backup_{i:02d}{extension}"
    if backup_path.exists():
        backup_time = backup_path.stat().st_mtime
        if backup_time < oldest_time:
            oldest_time = backup_time
            next_index = i
    else:
        next_index = i
        break
```

## 4. ドラッグ&ドロップ機能

### 4.1 ファイルドロップ処理

#### 対応ファイル形式
**画像ファイル**
- 対応形式: PNG, JPEG, GIF, WebP等
- 処理: 画像要素として直接配置
- リサイズ: 最大400px（アスペクト比維持）

**メールファイル**
- 対応形式: .eml, .msg
- 処理: 青色のメール付箋を作成
- リンク: ファイルのフルパスを設定

**一般ファイル**
- 対応形式: PDF, DOC, TXT, ZIP等
- 処理: 黄色の付箋を作成
- リンク: ファイルのフルパスを設定

#### フルパスリンク機能
**機能概要**
- ドロップしたファイルの付箋には完全なファイルパスがリンクとして設定される

**技術実装**
```typescript
const elements = createStickyNoteElementsWithFullPath(
  coordinates.viewportX,
  coordinates.viewportY,
  file.name,
  result.files[0].path  // フルパス
);
```

**付箋構造**
- 矩形要素: フルパスリンク
- テキスト要素: フルパスリンク
- クリック動作: ローカルファイルシステムでファイルを開く

### 4.2 フォルダドロップ処理

#### フォルダショートカット作成
**機能概要**
- フォルダをドロップするとショートカット付箋を作成

**動作詳細**
1. フォルダのドロップを検知
2. フォルダパスを取得
3. バックエンドAPIでショートカットファイルを作成
4. 付箋をキャンバスに配置

**API呼び出し**
```typescript
const formData = new FormData();
formData.append('folder_path', entry.fullPath);
formData.append('current_path', filePath);

const response = await fetch('http://localhost:8000/api/create-folder-shortcut', {
  method: 'POST',
  body: formData
});
```

### 4.3 Outlookメール対応

#### メールデータ検出
**対応データ形式**
- `text/x-moz-url`
- `application/x-moz-file`
- `text/rtf`
- `text/html`（ファイルなし）
- `text/plain`（ファイルなし）

**検出ロジック**
```typescript
export const detectOutlookData = (dataTransfer: DataTransfer): boolean => {
  return dataTransfer.types.includes('text/x-moz-url') || 
         dataTransfer.types.includes('application/x-moz-file') ||
         (dataTransfer.types.includes('text/plain') && dataTransfer.files.length === 0);
};
```

#### 件名抽出
**抽出方法**
1. 各データ形式からテキストを取得
2. 最初の行を件名として使用
3. HTMLデータの場合はテキスト内容を抽出

```typescript
if (type === 'text/plain' && data) {
  const lines = data.split('\n');
  if (lines.length > 0) {
    subject = lines[0].trim() || 'Outlook Email';
  }
}
```

### 4.4 座標変換システム

#### ビューポート座標からシーン座標への変換
**機能概要**
- ドロップ位置をExcalidrawの内部座標系に正確に変換

**変換計算**
```typescript
export const convertToSceneCoordinates = (
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  appState: { zoom: { value: number }; scrollX: number; scrollY: number }
): DropCoordinates => {
  const x = clientX - containerRect.left;
  const y = clientY - containerRect.top;
  
  const viewportX = (appState.scrollX * -1) + x / appState.zoom.value;
  const viewportY = (appState.scrollY * -1) + y / appState.zoom.value;
  
  return { x, y, viewportX, viewportY };
};
```

**考慮要素**
- ズーム倍率（`appState.zoom.value`）
- スクロール位置（`appState.scrollX`, `appState.scrollY`）
- コンテナの境界矩形（`containerRect`）

### 4.5 ファイルアップロード処理

#### アップロード先ディレクトリ
**ローカルストレージ使用時**
- アップロード先: `プロジェクトルート/upload_local/`
- サブディレクトリ構造:
  - `upload_local/files/` - 一般ファイル
  - `upload_local/images/` - 画像ファイル
  - `upload_local/emails/` - メールファイル
  - `upload_local/folders/` - フォルダショートカット

**通常ファイル使用時**
- アップロード先: `ファイルと同じディレクトリ/uploads/`

**ディレクトリ決定ロジック**
```python
def get_upload_directory(file_path: str, file_type: str = "general") -> Path:
    if not file_path or file_path.startswith('localStorage'):
        base_dir = Path(__file__).parent.parent  # プロジェクトルート
        upload_dir = base_dir / "upload_local"
    else:
        base_dir = Path(file_path).parent
        upload_dir = base_dir / "uploads"
    
    # ファイル種別によるサブディレクトリ
    if file_type == "email":
        upload_dir = upload_dir / "emails"
    elif file_type == "image":
        upload_dir = upload_dir / "images"
    # ...
```

### 4.6 画像処理機能

#### 自動リサイズ
**機能概要**
- 大きな画像を400px最大サイズにリサイズ（アスペクト比維持）

**リサイズロジック**
```typescript
export const resizeImage = (
  originalWidth: number,
  originalHeight: number,
  maxSize: number = 400
): { width: number; height: number } => {
  let width = originalWidth;
  let height = originalHeight;

  if (width > height) {
    if (width > maxSize) {
      height = (height * maxSize) / width;
      width = maxSize;
    }
  } else {
    if (height > maxSize) {
      width = (width * maxSize) / height;
      height = maxSize;
    }
  }

  return { width, height };
};
```

#### 画像要素作成
**要素仕様**
- 中央配置: ドロップ位置を中心に配置
- ファイルID: ランダム生成
- スケール: [1, 1]

```typescript
export const createImageElement = (
  x: number, y: number, width: number, height: number, fileId: string
): NonDeletedExcalidrawElement => {
  return {
    type: "image",
    x: x - width / 2,
    y: y - height / 2,
    width, height,
    fileId,
    scale: [1, 1] as [number, number],
    // ... その他のプロパティ
  };
};
```

## 5. バックエンドAPI仕様

### 5.1 ファイル読み込みAPI

#### GET /api/load-file
**パラメータ**
- `filepath`: 読み込むファイルのパス

**レスポンス**
```json
{
  "data": {
    "type": "excalidraw",
    "version": 2,
    "source": "https://excalidraw.com",
    "elements": [...],
    "appState": {...},
    "files": {...}
  },
  "modified": 1234567890.123
}
```

### 5.2 ファイル情報取得API

#### GET /api/file-info
**パラメータ**
- `filepath`: 確認するファイルのパス

**レスポンス**
```json
{
  "modified": 1234567890.123,
  "exists": true
}
```

### 5.3 ファイル保存API

#### POST /api/save-file
**リクエストボディ**
```json
{
  "filepath": "/path/to/file.excalidraw",
  "data": {
    "type": "excalidraw",
    "version": 2,
    "source": "https://excalidraw.com",
    "elements": [...],
    "appState": {...},
    "files": {...}
  }
}
```

**レスポンス**
```json
{
  "success": true,
  "message": "File saved to /path/to/file.excalidraw"
}
```

### 5.4 ファイルアップロードAPI

#### POST /api/upload-files
**概要**
- 複数ファイルのアップロードに対応
- ファイル種別により適切なディレクトリに保存

**リクエスト**
- Content-Type: `multipart/form-data`
- files: アップロードするファイル群
- current_path: 現在のファイルパス
- file_type: ファイル種別（general, email, image）

**レスポンス**
```json
{
  "success": true,
  "files": [
    {
      "name": "document.pdf",
      "path": "/path/to/upload_local/files/document_1234567890.pdf",
      "size": 1024000
    }
  ]
}
```

### 5.5 フォルダショートカット作成API

#### POST /api/create-folder-shortcut
**概要**
- フォルダのショートカットファイルを作成

**リクエスト**
- Content-Type: `multipart/form-data`
- folder_path: フォルダのパス
- current_path: 現在のファイルパス

**レスポンス**
```json
{
  "success": true,
  "folderPath": "/path/to/upload_local/folders/FolderName_1234567890.txt"
}
```

### 5.6 メール保存API

#### POST /api/save-email
**概要**
- Outlookメールデータを.emlファイルとして保存

**リクエストボディ**
```json
{
  "emailData": "メールの内容データ",
  "subject": "メールの件名",
  "currentPath": "/path/to/current/file.excalidraw"
}
```

**レスポンス**
```json
{
  "success": true,
  "savedPath": "/path/to/upload_local/emails/subject_1234567890.eml"
}
```

### 5.7 アップロードファイル配信API

#### GET /api/file/{file_path:path}
**概要**
- アップロードされたファイルをWebブラウザから配信

**パラメータ**
- file_path: `uploads/` または `upload_local/` から始まるファイルパス

**セキュリティ**
- `uploads/` または `upload_local/` ディレクトリ内のファイルのみアクセス可能
- ディレクトリトラバーサル攻撃を防止

**レスポンス**
- Content-Type: `application/octet-stream`
- ファイルのバイナリデータ

## 6. エラーハンドリング

### 6.1 クリップボードアクセスエラー
**エラー条件**
- HTTPS環境またはlocalhost環境以外でのアクセス
- ブラウザがクリップボードAPIに対応していない

**対応**
- エラーメッセージを表示
- 機能を無効化

### 6.2 ファイルアクセスエラー
**エラー条件**
- ファイルが存在しない
- ファイルの読み込み権限がない
- ファイル形式が不正

**対応**
- 404エラー時は初期データを使用
- その他のエラーは適切なエラーメッセージを表示

### 6.3 バックアップエラー
**エラー条件**
- バックアップディレクトリの作成に失敗
- バックアップファイルの書き込みに失敗

**対応**
- エラーログを出力
- 元ファイルの保存処理は継続

### 6.4 ドラッグ&ドロップエラー

#### ファイルアップロードエラー
**エラー条件**
- バックエンドサーバーが停止している
- ファイルサイズが制限を超過
- 対応していないファイル形式

**対応**
- ネットワークエラー: 接続状態を確認するメッセージを表示
- サイズ制限: ファイルサイズ制限のメッセージを表示
- 形式エラー: 対応形式の一覧を表示

#### 座標変換エラー
**エラー条件**
- ExcalidrawAPIが初期化されていない
- コンテナ要素が取得できない

**対応**
- API未初期化: 初期化完了まで処理を延期
- コンテナエラー: デフォルト座標(0, 0)を使用

#### メールデータ解析エラー
**エラー条件**
- Outlookデータの形式が予期しないもの
- 件名の抽出に失敗

**対応**
- データ形式エラー: 「Outlook Email」をデフォルト件名として使用
- 解析失敗: エラーログを出力し、処理を継続

## 7. パフォーマンス最適化

### 7.1 変更検知の最適化
- JSON文字列化による高速な変更検知
- 不要な保存処理の削除

### 7.2 ファイル監視の最適化
- 5秒間隔での適切な監視頻度
- 変更がない場合の処理スキップ

### 7.3 メモリ使用量の最適化
- 大きなファイルの適切な処理
- 不要なデータの適切な開放

### 7.4 ドラッグ&ドロップ最適化

#### イベント処理の最適化
- ドラッグオーバーイベントの効率的な処理
- 不要なイベント伝播の停止
- キャプチャフェーズでのイベント処理

```typescript
// 効率的なイベント処理
document.addEventListener('dragover', preventDefaultDragOver, true);
document.addEventListener('drop', handleDrop, true);
```

#### 画像処理の最適化
- 大きな画像の自動リサイズ（400px制限）
- アスペクト比を維持した効率的なリサイズ
- メモリ使用量を考慮した画像処理

#### ファイルアップロードの最適化
- 並列処理による複数ファイルの効率的なアップロード
- 適切なタイムスタンプによる重複回避
- ファイル名のサニタイズ処理

## 8. Obsidian連携機能

### 8.1 互換性機能
- **自動検知**: パスに `obsidian` が含まれる場合、自動的に Obsidian 互換モードで動作。
- **ファイル形式**: Obsidian Excalidraw プラグインと互換性のある `.excalidraw.md` 形式（Markdown + Embedded JSON）をサポート。
- **圧縮対応**: JSONデータは `lz-string` アルゴリズムで圧縮して保存し、プラグイン設定に関わらず読み込み可能（圧縮・非圧縮自動判別）。

### 8.2 自動移行
- **保存時の移行**: `obsidian` フォルダ内で `.excalidraw` として保存しようとすると、自動的に `.excalidraw.md` に変換して保存。
- **読み込み時の優先順**: `.excalidraw` ファイルを開こうとした際、同名の `.excalidraw.md` が存在すればそちらを優先して読み込む。

### 8.3 バックアップ除外
- Obsidian 管理下のファイルについては、アプリ独自のバックアップシステム（`backup/` フォルダ作成）を無効化し、Obsidian 側のバージョン管理等に委ねる。

### 8.4 画像ファイル管理
**機能概要**
- 画像を外部ファイルとして保存し、Wikilink形式で参照することでファイルサイズを削減

**動作詳細**

#### 保存時の処理
1. `files`内のdataURLを抽出
2. Base64デコードして外部画像ファイルとして保存（ファイル名: `{file_id[:8]}.{ext}`）
3. 画像ファイル名のマッピングを生成
4. dataURLを削除してファイルサイズを削減
5. `## Embedded Files`セクションに追加

```markdown
## Embedded Files
9a37ea52: [[9a37ea52.png]]
```

#### 読み込み時の処理
1. `## Embedded Files`セクションから画像ファイル名を読み取る
2. 外部画像ファイルを検索（同じディレクトリまたは親ディレクトリ）
3. `files`セクションに画像情報を復元
4. Base64エンコードしてdataURLとして埋め込む
5. フロントエンドには従来通りdataURLを返す

**効果**
- Markdownファイルサイズの大幅削減（dataURL削除により）
- 画像は外部ファイルとして管理
- Obsidianで画像が正常に表示される
- Wikilink形式でObsidian標準に準拠

### 8.5 Obsidian URLスキーム連携
**機能概要**
- `obsidian://` URLスキームをシステムのデフォルトハンドラーで開く機能
- macOS、Windows、Linuxに対応

**APIエンドポイント**
```
GET /api/open-url?url=<URLエンコードされたURL>
```

**使用例**
```javascript
// ObsidianでファイルをVault内で開く
const obsidianUrl = "obsidian://open?vault=obsidian_test&file=あらrh.excalidraw";
const encodedUrl = encodeURIComponent(obsidianUrl);
await fetch(`http://localhost:8008/api/open-url?url=${encodedUrl}`);
```

**動作詳細**

#### プラットフォーム別処理
- **macOS**: `open "obsidian://..."` コマンドを実行
- **Windows**: `os.startfile("obsidian://...")` を実行
- **Linux**: `xdg-open "obsidian://..."` コマンドを実行

#### 技術実装
```python
@app.get("/api/open-url")
async def open_url(url: str):
    decoded_url = urllib.parse.unquote_plus(url)
    await asyncio.to_thread(_launch_with_system, decoded_url)
    return {"success": True, "url": decoded_url}
```

**効果**
- フロントエンドからObsidianアプリを直接起動可能
- Vault内のファイルをネイティブObsidianエディタで開ける
- クロスプラットフォーム対応により、どのOSでも動作