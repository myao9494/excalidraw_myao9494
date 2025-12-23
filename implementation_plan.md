# Obsidian連携機能 実装計画

## 概要
Obsidian Vault 内の `.excalidraw.md` ファイルを直接編集可能にするためのバックエンド改修計画です。
パスに `obsidian` が含まれる場合、自動的に Obsidian 互換の Markdown 形式（圧縮 JSON 対応）で保存します。

## ユーザーレビュー必須事項
- **依存ライブラリ追加**: `lzstring` を Python 環境に追加する必要があります。

## 変更内容 (Backend)

### 依存関係
#### [MODIFY] [requirements.txt](file:///Users/sudoupousei/000_work/excalidraw_myao9494/backend/requirements.txt)
- `lzstring` パッケージを追加。

### ファイル操作ロジック
#### [MODIFY] [main.py](file:///Users/sudoupousei/000_work/excalidraw_myao9494/backend/main.py)
- `load_file`: 
    - パスが `obsidian` を含み、拡張子が `.excalidraw` の場合、同名の `.excalidraw.md` が存在すればそちらを読み込む（移行後のファイル優先）。
    - 対象が Obsidian 形式の場合、Markdown から JSON を抽出・解凍して返す。
- `save_file`: 
    - パスが `obsidian` を含み、拡張子が `.excalidraw` の場合、保存先を `.excalidraw.md` に変更する。
    - Obsidian モードならバックアップをスキップし、Markdown 形式で（JSONを圧縮して）保存する。
- ヘルパー関数追加:
    - `is_obsidian_path(filepath: str) -> bool`
    - `extract_json_from_markdown(content: str) -> str (json string)`
    - `embed_json_into_markdown(original_content: str, json_str: str) -> str (new markdown content)`

## 検証計画

### 自動テスト (TDD)
実装前に以下のテストケースを作成し、TDD で進めます。

1. **Obsidian ファイル判定テスト**:
    - `path/to/obsidian/file.excalidraw.md` -> True
    - `path/to/normal/file.excalidraw` -> False

2. **読み込みテスト**:
    - **通常**: テスト用 Markdown ファイル (圧縮 JSON 含む) を作成し、JSON が返ることを確認。
    - **移行優先**: `test.excalidraw` と `test.excalidraw.md` が両方ある場合、`test.excalidraw` をリクエストしても `.md` の内容が返ることを確認。

3. **保存テスト**:
    - **新規/移行**: `file.excalidraw` (in obsidian) への保存リクエストが、`file.excalidraw.md` として保存されること。
    - **既存更新**: Frontmatter やテキスト要素が維持され、JSON ブロックのみ更新されること。
    - **バックアップ**: `backup` フォルダが作成されないこと。

### 手動検証
1. 実際に Obsidian Vault 内（`.../obsidian/...`フォルダ）にファイルを保存し、Obsidian アプリで開けるか確認。
2. Obsidian 側で編集し、Web アプリ側で変更が反映されるか確認。
