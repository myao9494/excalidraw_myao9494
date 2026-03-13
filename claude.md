# 仕様書

## バックエンド API 仕様

### ファイル読み込み (`GET /api/load-file`)
- **対応フォーマット**: `.excalidraw`, `.excalidraw.md`
- **挙動**:
  - 指定されたパスのファイルを読み込み、JSONデータを返す。
  - **空ファイル対応**: ファイルが空（サイズ0または空白のみ）の場合、デフォルトの初期状態（要素なしのExcalidrawデータ）を返す。これにより新規作成時のエラーを防ぐ。
  - **エラーハンドリング**:
    - ファイルが存在しない場合: 404 Not Found
    - JSONが無効な場合: 400 Bad Request
    - その他のエラー: 500 Internal Server Error
- **Obsidian互換性**:
  - `.excalidraw.md` ファイルの場合、Markdown内のJSONブロックを抽出して返す。
  - 画像などの埋め込みファイルも解決して `files` プロパティに含める。

## PWA配信仕様

### バックエンドからのフロントエンド配信
- バックエンド(FastAPI, port 3001)が `dist/` ディレクトリの静的ファイルを配信
- APIルート（`/api/*`）が優先され、その他のリクエストは静的ファイルを返す
- ルート(`/`)は`dist/index.html`を返す（SPAフォールバック）

### PWA構成
- `manifest.json`: アプリ名、テーマカラー、表示モード等を定義
- `sw.js`: Service Worker（キャッシュファースト/ネットワークファースト戦略）
- `API_BASE_URL`: 同一オリジン配信時は相対パス、開発時は`http://{host}:3001`

### 起動方法
- **本番**: `./start_servers.sh` (バックエンドのみ、port 3001)
- **開発**: `./start_dev.sh` (Vite port 3001 + バックエンド port 3001)
