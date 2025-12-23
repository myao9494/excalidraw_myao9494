# Obsidian Excalidraw 互換機能仕様書

## 概要
Obsidian Vault 内に保存される Excalidraw ファイル (`.excalidraw.md` または `.md`) を、本アプリケーションで直接閲覧・編集・保存できるようにするための仕様です。
ファイルパスに `obsidian` が含まれる場合、自動的に Obsidian 互換モードとして動作します。

## 対象ファイル
以下の条件のいずれかを満たすファイルを対象とします。
1. **パス**: `obsidian` を含み、拡張子が `.excalidraw.md`。
2. **パス**: `obsidian` を含み、拡張子が `.excalidraw` (移行対象)。

## 実装方針 (Backend)

`backend/main.py` 内の `load_file` および `save_file` を改修し、パスによる条件分岐を導入します。

### 0. 依存ライブラリの追加
- `lzstring`: Obsidian プラグイン互換の圧縮・解凍に使用。
- `requirements.txt` に追加。

### 1. 読み込み処理 (`load_file`)

**フロー:**
1. ファイルパスと拡張子をチェック。
2. **Obsidianフォルダ内の `.excalidraw` リクエストの場合**:
    - 同名の `.excalidraw.md` が存在するか確認する。
    - **存在する場合**: リクエストされたパスを `.excalidraw.md` に読み替えて、以下の Obsidian 読み込みフローを実行する（移行済みファイルの優先）。
    - **存在しない場合**: 通常の JSON ロード処理 (`load_json_file`) を実行。
3. **Obsidian対象 (.excalidraw.md)** の場合:
    - ファイルをテキストとして読み込む。
    - 正規表現を用いて、Markdown 内の JSON ブロックを抽出する。
        - 検索パターン: ``` ```json\n(.*?)\n``` ``` (最短マッチ、複数行対応)
    - **圧縮判定と解凍**:
        - 抽出した文字列が JSON としてパースできない場合、あるいは特定のヘッダー/形式である場合、`lzstring` で解凍を試みる。
        - 成功すれば JSON としてパース。
    - パースしたデータ (`elements`, `appState` 等) をフロントエンドに返す。

### 2. 保存処理 (`save_file`)

**フロー:**
1. ファイルパスと拡張子をチェック。
2. **Obsidian対象** の場合:
    - **保存パスの決定**:
        - 拡張子が `.excalidraw` の場合、自動的に `.excalidraw.md` に変更する（自動移行）。
    - **バックアップ**: `create_backup` を**実行しない**。
    - **保存データの準備**:
        - フロントエンドから送られてきた JSON データを文字列化する。
        - **圧縮処理**: `lzstring` を使用してデータを圧縮する。
    - **ファイル書き込み**:
        - **既存ファイル (.excalidraw.md) がある場合**:
            - 元の Markdown ファイルを読み込む。
            - 既存の JSON ブロック (```json ... ```) を特定し、コンテンツを**圧縮済みの文字列**で置換する。
            - YAML Frontmatter や `# Text Elements` など、他の部分は維持する。
        - **新規ファイル (または移行) の場合**:
            - 以下のテンプレートを使用してファイルを生成する（JSON部分は圧縮文字列を埋め込む）。
            - ※ `.excalidraw` からの移行時、元のファイルは削除せずに残す（安全策）。読み込みロジックで `.md` が優先されるため実質的に移行となる。

**新規作成用テンプレート:**
```markdown
---
tags: [excalidraw]
excalidraw-plugin: parsed
excalidraw-plugin-version: 2.0.0
---

# Text Elements


# Drawing
```json
{COMPRESSED_DATA}
```
```

### 3. 画像の扱い (Future Scope)
- 本対応では「画像の埋め込み」については標準 Excalidraw の仕様（JSON内の `files` に dataURL で埋め込み）を維持する。
- Obsidian プラグイン特有の「画像切り出し＆リンク化」機能は、今回の範囲外とする（JSON内にデータがあれば、Obsidianプラグインはそれを表示できる可能性があるが、重複する可能性がある）。

## 技術詳細

### Python ライブラリ
- `re`: 正規表現によるブロック抽出。
- `lzstring`: `pip install lzstring`。
    - 注意: JSの `lz-string` と互換性のある Python 実装を選定する必要がある (通常 `lzstring` パッケージで可)。

## テスト計画
1. **通常ファイルテスト**: 既存の `.excalidraw` ファイルが問題なく読み書きできること。
2. **Obsidian 新規保存**: `obsidian` フォルダ配下に新規保存し、Obsidian アプリで開けること。
3. **Obsidian 既存編集**: Obsidian で作成したファイルを編集し、保存しても他の Markdown 要素（Frontmatter等）が消えないこと。
4. **バックアップなし**: Obsidian モード時に `backup` フォルダが作成されないこと。

## 参考資料
- [obsidian-excalidraw-plugin GitHub](https://github.com/zsviczian/obsidian-excalidraw-plugin)
- [Compression logic (LZ-String)](https://github.com/pieroxy/lz-string/)
