# Obsidian連携機能 実装ウォークスルー

## 実装概要
Obsidian Vault内のファイルを直接扱えるように、バックエンドに互換性レイヤーを実装しました。

## 変更内容

### 1. 仕様書の策定
`docs/obsidian_compatibility_spec.md` を作成し、Obsidianプラグインとの互換性仕様を定義しました。
- 対象: パスに `obsidian` を含み、拡張子が `.excalidraw.md` (または `.excalidraw` からの移行)
- 形式: Markdownファイル内に `lz-string` で圧縮されたJSONを埋め込む形式

### 2. バックエンド実装 (`backend/main.py`)
以下の機能を追加しました：
- **`lzstring` ライブラリ導入**: JSONの圧縮・解凍処理に使用。
- **`is_obsidian_path`**: ファイルパスがObsidian管理下かどうかの判定。
- **`extract_json_from_markdown`**: MarkdownからJSONブロックを抽出・解凍。
- **`embed_json_into_markdown`**: JSONを圧縮してMarkdownテンプレートに埋め込み。
- **`load_file` / `save_file` の改修**:
    - `.excalidraw` -> `.excalidraw.md` への自動リダイレクト・保存時移行。
    - Obsidianモード時のバックアップ停止。

### 3. テスト (`backend/test/test_obsidian_compatibility.py`)
ユニットテストを作成し、以下の動作を検証しました：
- パス判定ロジックの正確性
- MarkdownからのJSON抽出（通常/圧縮）
- MarkdownへのJSON埋め込み（新規/既存維持）

## 検証結果
`pytest` による自動テストをパスしました。

```bash
backend/test/test_obsidian_compatibility.py ...... [100%]
```

## 次のステップ
- フロントエンド側で実際に Obsidian Vault 内のファイルを開き、保存等の操作を行って動作確認を行ってください。
