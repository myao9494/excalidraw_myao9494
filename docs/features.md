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

## 4. バックエンドAPI仕様

### 4.1 ファイル読み込みAPI

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

### 4.2 ファイル情報取得API

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

### 4.3 ファイル保存API

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

## 5. エラーハンドリング

### 5.1 クリップボードアクセスエラー
**エラー条件**
- HTTPS環境またはlocalhost環境以外でのアクセス
- ブラウザがクリップボードAPIに対応していない

**対応**
- エラーメッセージを表示
- 機能を無効化

### 5.2 ファイルアクセスエラー
**エラー条件**
- ファイルが存在しない
- ファイルの読み込み権限がない
- ファイル形式が不正

**対応**
- 404エラー時は初期データを使用
- その他のエラーは適切なエラーメッセージを表示

### 5.3 バックアップエラー
**エラー条件**
- バックアップディレクトリの作成に失敗
- バックアップファイルの書き込みに失敗

**対応**
- エラーログを出力
- 元ファイルの保存処理は継続

## 6. パフォーマンス最適化

### 6.1 変更検知の最適化
- JSON文字列化による高速な変更検知
- 不要な保存処理の削除

### 6.2 ファイル監視の最適化
- 5秒間隔での適切な監視頻度
- 変更がない場合の処理スキップ

### 6.3 メモリ使用量の最適化
- 大きなファイルの適切な処理
- 不要なデータの適切な開放