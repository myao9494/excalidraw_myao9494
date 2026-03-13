# Excalidraw PWA (myao9494) 仕様・変更履歴

## 概要
ExcalidrawをベースにしたPWAアプリケーション。

## Service Worker仕様

- **キャッシュ戦略**:
  - 静的アセット（JS, CSS, フォントなど）: キャッシュファースト
  - APIリクエストなど（`/api/`）: ネットワークファースト
  - HTMLなどのその他リソース: ネットワークファースト（フォールバックでキャッシュ）

- **制約**:
  - Cache API（`caches.put`など）はGETリクエストのみをサポートしています。
  - POST / PUT / DELETE 等のリクエストはキャッシュ対象外とし、Fetch APIのレスポンスをそのまま返却します。

## 変更履歴

- **2026/03/09**: 
  - `sw.js`: キャッシュ戦略を修正し、POSTリクエスト時に `caches.put` を実行しないように制限しました。
  - `index.html`: `<meta name="apple-mobile-web-app-capable" content="yes">` の非推奨警告（Deprecated warning）を解消するため、標準の `<meta name="mobile-web-app-capable" content="yes" />` を追加しました。
