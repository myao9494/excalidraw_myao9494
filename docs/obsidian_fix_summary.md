# Obsidian互換機能の修正サマリー

## 修正日時
2025-12-23

## 発見された問題
実際のObsidianファイル（`Drawing 2025-12-23 07.02.50.excalidraw.md`）と比較した結果、以下の違いが判明：

### 1. Frontmatterの順序
- **修正前**: `tags` → `excalidraw-plugin`
- **修正後**: `excalidraw-plugin` → `tags`

### 2. 警告メッセージの欠落
- **追加**: `==⚠ Switch to EXCALIDRAW VIEW...==` メッセージ

### 3. セクション名の違い
- **修正前**: `# Drawing`
- **修正後**: `# Excalidraw Data`

### 4. コードブロックタイプ
- **修正前**: ` ```json`
- **修正後**: ` ```compressed-json`

### 5. コメント記号
- **追加**: `%%` で Drawing セクションを囲む（Obsidianのコメント構文）

## 修正内容

### backend/main.py の変更

#### 1. テンプレートの更新 (行78-96)
```python
template = """---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'


# Excalidraw Data

## Text Elements

%%
## Drawing
```compressed-json
{COMPRESSED_DATA}
```
%%"""
```

#### 2. JSON抽出の正規表現を更新 (行42)
```python
# compressed-json と json の両方に対応
match = re.search(r'```(?:compressed-json|json)\n(.*?)\n```', content, re.DOTALL)
```

#### 3. JSON置換の正規表現を更新 (行103)
```python
# compressed-json と json の両方に対応
pattern = r'(```(?:compressed-json|json)\n)(.*?)(\n```)'
```

#### 4. 末尾追加時のフォーマット修正 (行108)
```python
return original_content + f"\n\n%%\n## Drawing\n```compressed-json\n{compressed}\n```\n%%\n"
```

## テスト結果

### ✅ 成功したテスト

1. **非圧縮JSONの読み込み**
   - Obsidian形式のMarkdownから非圧縮JSONを正常に抽出

2. **新規ファイルの保存**
   - 正しいObsidian形式（compressed-json）で保存
   - LZ-String圧縮が正常に動作

3. **圧縮ファイルの読み込み**
   - compressed-jsonブロックから圧縮データを抽出
   - LZ-String解凍が正常に動作

4. **既存ファイルの更新**
   - 既存の圧縮ファイルに要素を追加
   - Frontmatterやコメント構造を保持

5. **バックアップ不作成の確認**
   - Obsidianファイルではバックアップフォルダを作成しない
   - 仕様通りの動作を確認

### テストファイル
- `/tests/obsidian_test/uncompressed_test.excalidraw.md` - 非圧縮JSONテスト
- `/tests/obsidian_test/save_test.excalidraw.md` - 保存・更新テスト

## 使用方法

### Obsidianファイルの読み込み
```bash
GET /api/load-file?filepath=/path/to/obsidian/file.excalidraw.md
```

### Obsidianファイルの保存
```bash
POST /api/save-file
{
  "filepath": "/path/to/obsidian/file.excalidraw.md",
  "data": { ... },
  "force_backup": false
}
```

### 自動判定
- パスに `obsidian`（大文字小文字不問）が含まれる場合、自動的にObsidian互換モードで処理
- `.excalidraw` → `.excalidraw.md` への自動変換
- バックアップの無効化

## 修正履歴

### 2025-12-23 第3回修正: 画像の外部ファイル化とEmbedded Files対応

**問題**:
1. 画像がdataURLとしてMarkdownファイル内に埋め込まれており、ファイルサイズが非常に大きくなっていました
2. Obsidianで画像が表示されない（`## Embedded Files`セクションがない）

**修正内容**:

1. **テンプレート更新**: `backend/main.py:72-151`
   - `## Embedded Files`セクションの追加
   - Wikilink形式での画像参照: `file_id: [[filename]]`
   - 既存コンテンツの場合もEmbedded Filesセクションを更新

2. **保存時**: `backend/main.py:867-906`
   - `files`内のdataURLを抽出
   - 外部画像ファイルとして保存（ファイル名: `{file_id[:8]}.{ext}`）
   - 画像ファイル名のマッピングを生成
   - dataURLを削除してファイルサイズを削減
   - Embedded Filesセクションに追加

3. **読み込み時**: `backend/main.py:536-626`
   - `## Embedded Files`セクションから画像ファイル名を読み取る
   - 外部画像ファイルを検索（同じディレクトリまたは親ディレクトリ）
   - filesセクションに画像情報を復元
   - Base64エンコードしてdataURLとして埋め込む
   - フロントエンドには従来通りdataURLを返す

**効果**:
- Markdownファイルサイズ: 大幅削減（dataURL削除により）
- 画像は外部ファイルとして管理
- Obsidianで画像が正常に表示される
- Wikilink形式でObsidian標準に準拠

### 2025-12-23 第2回修正: 改行文字の処理

**問題**:
Obsidianで保存された圧縮データは複数行に分割されており、改行文字が含まれているため、Python lzstringライブラリが解凍に失敗していました。

**エラー**:
```
KeyError: '\n'
File "/opt/miniconda3/envs/mine/lib/python3.12/site-packages/lzstring/__init__.py", line 33, in getBaseValue
```

**修正内容**: backend/main.py:61
```python
# すべての改行と空白を除去してから解凍
compressed_clean = ''.join(json_content.split())
decompressed = lz.decompressFromBase64(compressed_clean)
```

**テスト結果**:
- ✅ Obsidianで保存された複数行圧縮データの読み込み成功
- ✅ 読み込み → 編集 → 保存 → 再読み込みのラウンドトリップ成功
- ✅ データ整合性の検証成功

## 既知の事項

### 保存形式について
- このアプリは圧縮データを**1行**で保存します
- Obsidianは圧縮データを**複数行**に分割して保存します
- 両方の形式の読み込みに対応しています

## 参考ファイル
- 実装仕様: `/docs/obsidian_compatibility_spec.md`
- テストコード: `/tests/test_obsidian_integration.py`
