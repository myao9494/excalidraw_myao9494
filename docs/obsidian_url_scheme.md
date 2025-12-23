# Obsidian URLスキーム連携ガイド

## 概要
このドキュメントでは、Excalidrawアプリから`obsidian://` URLスキームを使用してObsidianアプリを開く方法を説明します。

## 機能
- ExcalidrawファイルをObsidianで直接開く
- クロスプラットフォーム対応（macOS、Windows、Linux）
- URLエンコーディングの自動処理

## APIエンドポイント

### `/api/open-url`

**メソッド**: `GET`

**パラメータ**:
- `url` (必須): URLエンコードされたObsidian URLスキーム

**レスポンス**:
```json
{
  "success": true,
  "url": "obsidian://open?vault=obsidian_test&file=test.excalidraw",
  "message": "Opened URL with system handler"
}
```

**エラーレスポンス**:
```json
{
  "detail": "Invalid URL format"
}
```

## 使用例

### JavaScript/TypeScript

```typescript
/**
 * ObsidianでファイルをVault内で開く
 */
async function openInObsidian(vaultName: string, filePath: string) {
  // Obsidian URLを構築
  const obsidianUrl = `obsidian://open?vault=${vaultName}&file=${filePath}`;

  // URLエンコード
  const encodedUrl = encodeURIComponent(obsidianUrl);

  try {
    const response = await fetch(
      `http://localhost:8008/api/open-url?url=${encodedUrl}`
    );

    if (response.ok) {
      const result = await response.json();
      console.log('Obsidianで開きました:', result.url);
    } else {
      console.error('エラー:', response.status);
    }
  } catch (error) {
    console.error('リクエスト失敗:', error);
  }
}

// 使用例
openInObsidian('obsidian_test', 'あらrh.excalidraw');
```

### curlコマンド

```bash
# 基本的な使用例
curl "http://localhost:8008/api/open-url?url=obsidian%3A%2F%2Fopen%3Fvault%3Dobsidian_test%26file%3Dtest.excalidraw"

# 日本語ファイル名の例
curl "http://localhost:8008/api/open-url?url=$(python3 -c 'import urllib.parse; print(urllib.parse.quote_plus("obsidian://open?vault=obsidian_test&file=あらrh.excalidraw"))')"
```

### Pythonスクリプト

```python
import urllib.parse
import requests

def open_in_obsidian(vault_name: str, file_path: str):
    """ObsidianでファイルをVault内で開く"""
    # Obsidian URLを構築
    obsidian_url = f"obsidian://open?vault={vault_name}&file={file_path}"

    # URLエンコード
    encoded_url = urllib.parse.quote_plus(obsidian_url)

    # APIリクエスト
    response = requests.get(
        f"http://localhost:8008/api/open-url?url={encoded_url}"
    )

    if response.ok:
        result = response.json()
        print(f"Obsidianで開きました: {result['url']}")
    else:
        print(f"エラー: {response.status_code}")

# 使用例
open_in_obsidian('obsidian_test', 'あらrh.excalidraw')
```

## Obsidian URLスキームの構造

### 基本フォーマット
```
obsidian://open?vault=<vault名>&file=<ファイルパス>
```

### パラメータ
- `vault`: Vaultの名前（必須）
- `file`: Vault内のファイルパス（必須）

### 例
```
obsidian://open?vault=MyVault&file=Notes/test.md
obsidian://open?vault=obsidian_test&file=Excalidraw/drawing.excalidraw.md
```

## プラットフォーム別の動作

### macOS
```bash
open "obsidian://open?vault=obsidian_test&file=test.excalidraw"
```

### Windows
```python
import os
os.startfile("obsidian://open?vault=obsidian_test&file=test.excalidraw")
```

### Linux
```bash
xdg-open "obsidian://open?vault=obsidian_test&file=test.excalidraw"
```

## トラブルシューティング

### Obsidianが開かない場合
1. Obsidianアプリがインストールされているか確認
2. Vault名が正しいか確認
3. ファイルパスがVault内に存在するか確認

### URLエンコーディングエラー
- 日本語やスペースを含むパスは必ず`encodeURIComponent()`でエンコード
- バックエンドで自動的に`urllib.parse.unquote_plus()`でデコード

### CORS エラー
- バックエンドのCORS設定で`*`を許可しているため、通常は発生しない
- 本番環境では適切なオリジンに制限することを推奨

## セキュリティ考慮事項

### URL検証
バックエンドで基本的なURL検証を実施：
- URL内に `:` が含まれることを確認
- 空のURLを拒否

### 推奨事項
- 信頼できるソースからのURLのみを処理
- ユーザー入力をそのまま使用しない
- 本番環境では追加の検証を実装

## 関連ファイル

- **バックエンド実装**: `backend/main.py` (行892-917)
- **機能仕様書**: `docs/features.md` (セクション8.5)
- **テストコード**: `tests/test_open_url.py`

## 参考リンク

- [Obsidian URI](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
