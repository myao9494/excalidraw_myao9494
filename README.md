# Excalidraw カスタムキーボードショートカット

このプロジェクトは、Excalidrawにカスタムキーボードショートカットと付箋機能を追加したものです。

## 概要

元々Flask + CDN版Excalidrawで実装されていた機能を、React + TypeScript + Vite環境に移植しました。  
マウス位置を基準とした付箋作成や、レイヤー操作、ローカルファイル操作、自動バックアップなど、生産性を向上させる機能を提供します。

## ドキュメント

- [要件定義書](docs/requirements.md) - プロジェクトの要件と制約
- [機能仕様書](docs/features.md) - 詳細な機能仕様と技術実装
- [TODOリスト](docs/todo.md) - 実装済み機能と今後の開発予定
- [システム構成図](docs/architecture.md) - 全体構成とアーキテクチャ

## 機能一覧

### キーボードショートカット

| キー | 機能 | 説明 |
|------|------|------|
| `C` | 矢印なし直線 | 矢印ツールを選択し、矢印ヘッドを無効化した直線を描画 |
| `N` | 基本付箋作成 | マウス位置に黄色の付箋を作成 |
| `W` | クリップボード付箋 | クリップボードの内容からリンク付箋を作成 |
| `Cmd/Ctrl + M` | 最前面移動 | 選択した要素を最前面に移動 |
| `Cmd/Ctrl + B` | 最背面移動 | 選択した要素を最背面に移動 |

### 付箋機能

- **基本付箋**: 黄色背景 (`#fef3bd`) - デフォルトの付箋
- **リンク付箋**: 黄色背景 (`#fef3bd`) - ファイルパスやURLを埋め込み
- **メール付箋**: 青色背景 (`#e3f2fd`) - メールファイル用（将来の拡張）

## 技術仕様

### 開発環境

- **React**: 19.0.0
- **TypeScript**: ^5
- **Vite**: 5.0.12
- **@excalidraw/excalidraw**: *
- **FastAPI**: バックエンドファイル操作用

### プロジェクト構成

```
.
├── hooks/
│   ├── useMousePosition.ts      # マウス位置追跡
│   └── useKeyboardShortcuts.ts  # キーボードショートカット
├── utils/
│   ├── stickyNoteUtils.ts       # 付箋作成ユーティリティ
│   ├── localStorage.ts          # ローカルストレージ操作
│   └── fileUtils.ts             # ファイル操作ユーティリティ
├── components/
│   └── ExampleApp.tsx           # メインアプリケーション
├── backend/
│   └── main.py                  # FastAPIバックエンド
├── package.json
├── tsconfig.json
└── README.md
```

### 主要な技術的特徴

1. **座標変換**: ビューポート座標とシーン座標の変換を適切に処理
2. **型安全性**: TypeScriptを使用した完全な型定義
3. **カスタムフック**: 再利用可能なロジックの分離
4. **Excalidraw API**: 公式APIを使用した安全な実装
5. **ファイル操作**: FastAPIバックエンドを使用したローカルファイル操作
6. **自動保存**: オブジェクト変更時の自動保存機能
7. **バックアップ**: 自動バックアップ機能（5分間隔、最大10個保持）

## インストール・実行方法

### 1. 依存関係のインストール

```bash
npm install
```

### 2. バックエンドサーバー起動

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. フロントエンド開発サーバー起動

```bash
npm start
```

### 4. ビルド

```bash
npm run build
```

### 5. オフライン使用

```bash
# ビルド後の静的ファイルでオフライン実行
cd dist
python -m http.server 8080
# または dist/index.html を直接ブラウザで開く
```

## 使用方法

### 基本的な使い方

1. バックエンドサーバーを起動
2. フロントエンドアプリケーションを起動
3. 以下のキーボードショートカットを使用：
   - `C`: 直線描画モード
   - `N`: 付箋作成
   - `W`: クリップボード付箋作成
   - `Cmd/Ctrl + M`: 最前面移動
   - `Cmd/Ctrl + B`: 最背面移動

### ファイル操作機能

#### ファイル読み込み・保存
URLパラメータでファイルパスを指定して、ローカルファイルを読み込み・保存できます。

```
http://localhost:3001/?filepath=/path/to/your/file.excalidraw
```

#### 機能詳細
- **自動保存**: オブジェクトに変更があると自動的に保存
- **外部編集対応**: VSCodeなどで外部編集された場合、5秒間隔で自動リロード
- **VSCode互換**: 標準のExcalidrawファイル形式で保存
- **自動バックアップ**: 5分間隔でバックアップファイルを作成（最大10個保持）

### 付箋作成の詳細

#### Nキー（基本付箋）
- マウス位置に黄色の付箋を作成
- 「メモを入力」のプレースホルダーテキスト
- 作成後、テキストが自動選択される

#### Wキー（クリップボード付箋）
- クリップボードの内容を読み取り
- ファイルパスの場合、ファイル名を表示テキストとして使用
- `.py`ファイルの場合、`cmd python`プレフィックスを追加
- `.sh`/`.bat`ファイルの場合、`cmd`プレフィックスを追加

### レイヤー操作

- **最前面移動**: 選択した要素とその関連テキストを最前面に
- **最背面移動**: 選択した要素とその関連テキストを最背面に

## 注意事項

- 入力フィールド（input, textarea, contenteditable）にフォーカスがある場合、キーボードショートカットは無効化されます
- クリップボード機能は、HTTPSまたはlocalhost環境でのみ動作します
- 座標計算はズーム倍率を考慮して行われます

## オフライン使用について

### 利用可能機能
- **完全オフライン対応**: 基本的な描画機能、キーボードショートカット、付箋機能
- **ブラウザファイルAPI**: 標準的なファイル保存・読み込み（ブラウザの制限内）

### 制限事項
- **URLパラメータファイル読み込み不可**: バックエンドサーバーが必要
- **自動バックアップ機能不可**: バックエンドサーバーが必要
- **外部ファイル監視不可**: バックエンドサーバーが必要

### バックアップ機能

#### 自動バックアップの仕様
- **保存場所**: 元ファイルと同じディレクトリの `backup/` フォルダ
- **ファイル名**: `{元ファイル名}_backup_{00-09}.excalidraw`
- **最大保存数**: 10個（古いものから順次上書き）
- **保存条件**: 最新バックアップから5分以上経過した場合のみ作成

#### 動作例
元ファイル: `/path/to/myfile.excalidraw`

バックアップファイル:
- `/path/to/backup/myfile_backup_00.excalidraw`
- `/path/to/backup/myfile_backup_01.excalidraw`
- `/path/to/backup/myfile_backup_02.excalidraw`
- ...

## 今後の拡張予定

### Phase 2（高優先度）
- [ ] バックアップファイルの復元UI
- [ ] カスタムショートカットの設定UI
- [ ] 付箋テンプレート機能

### Phase 3（中優先度）
- [ ] ドラッグ&ドロップ機能の追加
- [ ] メール付箋機能の完全実装

### Phase 4（中優先度）
- [ ] パフォーマンス最適化
- [ ] 大容量ファイル対応

## 開発者向け情報

### カスタムフック

#### useMousePosition
マウス位置をリアルタイムで追跡するフック

```typescript
const mousePosition = useMousePosition();
// => { x: number, y: number }
```

#### useKeyboardShortcuts
キーボードショートカット機能を提供するフック

```typescript
useKeyboardShortcuts({
  excalidrawAPI,
  viewportCoordsToSceneCoords
});
```

### 付箋作成ユーティリティ

```typescript
// 基本付箋
const elements = createDefaultStickyNote(x, y);

// リンク付箋
const elements = createLinkStickyNote(x, y, text, link);

// メール付箋
const elements = createEmailStickyNote(x, y, subject);
```

### ファイル操作ユーティリティ

```typescript
// ファイル読み込み
const result = await loadExcalidrawFile(filePath);

// ファイル保存
const success = await saveExcalidrawFile(filePath, data);

// ファイル情報取得
const info = await getFileInfo(filePath);

// URLからファイルパス取得
const filePath = getFilePathFromUrl();
```

## ライセンス

このプロジェクトは元のExcalidrawライセンスに従います。