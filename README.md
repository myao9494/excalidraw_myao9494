# Excalidraw カスタムキーボードショートカット

このプロジェクトは、Excalidrawにカスタムキーボードショートカットと付箋機能を追加したものです。

## 概要

元々Flask + CDN版Excalidrawで実装されていた機能を、React + TypeScript + Vite環境に移植しました。  
マウス位置を基準とした付箋作成や、レイヤー操作など、生産性を向上させる機能を提供します。

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

### プロジェクト構成

```
.
├── hooks/
│   ├── useMousePosition.ts      # マウス位置追跡
│   └── useKeyboardShortcuts.ts  # キーボードショートカット
├── utils/
│   └── stickyNoteUtils.ts       # 付箋作成ユーティリティ
├── components/
│   └── ExampleApp.tsx           # メインアプリケーション
├── package.json
├── tsconfig.json
└── README.md
```

### 主要な技術的特徴

1. **座標変換**: ビューポート座標とシーン座標の変換を適切に処理
2. **型安全性**: TypeScriptを使用した完全な型定義
3. **カスタムフック**: 再利用可能なロジックの分離
4. **Excalidraw API**: 公式APIを使用した安全な実装

## インストール・実行方法

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 開発サーバー起動

```bash
npm start
```

### 3. ビルド

```bash
npm run build
```

## 使用方法

### 基本的な使い方

1. アプリケーションを起動
2. 以下のキーボードショートカットを使用：
   - `C`: 直線描画モード
   - `N`: 付箋作成
   - `W`: クリップボード付箋作成
   - `Cmd/Ctrl + M`: 最前面移動
   - `Cmd/Ctrl + B`: 最背面移動

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

## 今後の拡張予定

- [ ] ドラッグ&ドロップ機能の追加
- [ ] メール付箋機能の完全実装
- [ ] カスタムショートカットの設定UI
- [ ] 付箋テンプレート機能

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

## ライセンス

このプロジェクトは元のExcalidrawライセンスに従います。