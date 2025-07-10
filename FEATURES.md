# 機能説明書

## 1. キーボードショートカット機能

### 1.1 矢印なし直線描画（Cキー）

**概要**: 矢印ヘッドのない直線を描画する機能

**動作フロー**:
1. Cキーを押下
2. 矢印ツールが自動選択される
3. 線を描画
4. 描画完了時に矢印ヘッドが自動的に無効化される

**技術的詳細**:
- `pointerup`イベントを監視して新要素の作成を検出
- 要素の`startArrowhead`と`endArrowhead`プロパティを`null`に設定
- 一度のみ実行されるイベントリスナーを使用

```typescript
// 矢印ヘッドの無効化
(newElement as any).startArrowhead = null;
(newElement as any).endArrowhead = null;
```

### 1.2 基本付箋作成（Nキー）

**概要**: マウス位置に黄色の付箋を作成

**動作フロー**:
1. Nキーを押下
2. 現在のマウス位置を取得
3. ビューポート座標をシーン座標に変換
4. 矩形要素とテキスト要素を作成
5. シーンに追加し、テキストを選択状態に

**技術的詳細**:
- マウス位置は`useMousePosition`フックで取得
- 座標変換は`viewportCoordsToSceneCoords`関数を使用
- 矩形とテキストは`boundElements`で関連付け

### 1.3 クリップボード付箋作成（Wキー）

**概要**: クリップボードの内容から付箋を作成

**動作フロー**:
1. Wキーを押下
2. クリップボードからテキストを取得
3. ファイルパスの場合、適切なプレフィックスを追加
4. 付箋を作成してシーンに追加

**サポートするファイル形式**:
- `.py`ファイル: `cmd python {filepath}`
- `.sh`、`.bat`ファイル: `cmd {filepath}`
- その他: そのまま

**技術的詳細**:
- `navigator.clipboard.readText()`でクリップボードを読み取り
- ファイル名は正規表現でパスから抽出
- リンクプロパティにフルパスを設定

### 1.4 レイヤー操作（Cmd/Ctrl + M/B）

**概要**: 選択した要素を最前面・最背面に移動

**動作フロー**:
1. Cmd/Ctrl + M/Bを押下
2. 選択された要素を特定
3. 関連するテキスト要素も含めて収集
4. 要素配列を並び替え
5. シーンを更新

**技術的詳細**:
- 最前面: 配列の末尾に配置
- 最背面: 配列の先頭に配置
- `boundElements`を使用して関連要素を特定

## 2. 付箋作成システム

### 2.1 付箋の構造

付箋は以下の2つの要素から構成されます：

1. **矩形要素（Rectangle）**: 背景色とリンク情報を持つ
2. **テキスト要素（Text）**: 表示テキストと矩形への参照を持つ

### 2.2 色の定義

```typescript
export const STICKY_NOTE_COLORS = {
  DEFAULT: '#fef3bd',  // 黄色（基本付箋）
  EMAIL: '#e3f2fd',    // 青色（メール付箋）
  LINK: '#fef3bd'      // 黄色（リンク付箋）
};
```

### 2.3 座標計算

付箋の座標は中心点を基準として計算されます：

```typescript
// 矩形の左上角座標
x: centerX - width / 2,
y: centerY - height / 2,

// テキストの座標（10pxパディング）
textX: rectangleX + 10,
textY: rectangleY + 10,
```

### 2.4 要素の関連付け

矩形とテキストは以下の方法で関連付けられます：

```typescript
// 矩形要素
boundElements: [{ type: 'text', id: textId }]

// テキスト要素
containerId: rectangleId
```

## 3. マウス位置追跡システム

### 3.1 useMousePositionフック

**機能**: リアルタイムでマウス位置を追跡

**実装**:
```typescript
const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

useEffect(() => {
  const handleMouseMove = (event: MouseEvent) => {
    setMousePosition({
      x: event.clientX,
      y: event.clientY
    });
  };

  document.addEventListener('mousemove', handleMouseMove);
  return () => document.removeEventListener('mousemove', handleMouseMove);
}, []);
```

### 3.2 座標変換

マウス位置（ビューポート座標）をExcalidrawのシーン座標に変換：

```typescript
const sceneCoords = viewportCoordsToSceneCoords(
  { clientX: mousePosition.x, clientY: mousePosition.y },
  appState
);
```

## 4. エラーハンドリング

### 4.1 入力フィールドの除外

```typescript
const isInputFocused = target.matches('input, textarea, [contenteditable]');
if (isInputFocused) return;
```

### 4.2 座標の安全性確保

```typescript
const safeX = Number.isFinite(viewportPosition.x) ? viewportPosition.x : 100;
const safeY = Number.isFinite(viewportPosition.y) ? viewportPosition.y : 100;
```

### 4.3 例外処理

全ての主要機能にtry-catch文を実装し、エラーログを出力：

```typescript
try {
  // 機能実装
} catch (error) {
  console.error('機能名に失敗しました:', error);
}
```

## 5. パフォーマンス最適化

### 5.1 イベントリスナーの適切な管理

- `useEffect`のクリーンアップ関数でリスナーを削除
- 一度のみ実行されるリスナーは明示的に削除

### 5.2 座標計算の最適化

- 必要な時のみ座標変換を実行
- 計算結果をキャッシュして再利用

### 5.3 メモリリーク対策

- カスタムフックで状態を適切に管理
- 不要な再レンダリングを防止

## 6. 型安全性

### 6.1 TypeScript型定義

```typescript
// フック用のオプション型
interface KeyboardShortcutsOptions {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  viewportCoordsToSceneCoords: (coords: { clientX: number; clientY: number }, appState: any) => { x: number; y: number };
}

// 付箋作成用のオプション型
interface StickyNoteOptions {
  x: number;
  y: number;
  text?: string;
  backgroundColor?: string;
  link?: string;
  width?: number;
  height?: number;
}
```

### 6.2 Excalidraw要素の型安全性

```typescript
const rectangleElement: NonDeletedExcalidrawElement = {
  // 全プロパティを明示的に定義
};
```

## 7. 将来の拡張性

### 7.1 設定可能なショートカット

現在の実装はハードコードされていますが、将来的には設定ファイルで変更可能に：

```typescript
interface ShortcutConfig {
  line: string;
  stickyNote: string;
  clipboardNote: string;
  moveToFront: string;
  moveToBack: string;
}
```

### 7.2 追加の付箋タイプ

新しい付箋タイプを簡単に追加できる設計：

```typescript
export const createCustomStickyNote = (
  x: number, 
  y: number, 
  options: CustomStickyNoteOptions
) => {
  return createStickyNote({
    x,
    y,
    ...options
  });
};
```

### 7.3 プラグインシステム

機能を独立したプラグインとして分離する可能性：

```typescript
interface ExcalidrawPlugin {
  name: string;
  shortcuts: ShortcutDefinition[];
  initialize: (api: ExcalidrawImperativeAPI) => void;
  destroy: () => void;
}
```