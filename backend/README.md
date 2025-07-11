# Excalidraw File API Backend

FastAPIを使用したExcalidrawファイルの読み書きAPIサーバー

## セットアップ

1. 必要なパッケージをインストール:
```bash
pip install -r requirements.txt
```

2. サーバーを起動:
```bash
./start_server.sh
```

または:
```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## エンドポイント

### GET /api/load-file
ファイルを読み込みます。

パラメータ:
- `filepath`: 読み込むファイルのパス

### POST /api/save-file
ファイルを保存します。

リクエストボディ:
```json
{
  "filepath": "/path/to/file.excalidraw",
  "data": {
    "elements": [...],
    "appState": {...},
    "files": {...}
  }
}
```

## 使用方法

フロントエンドからは以下のようにアクセスします:

```
http://localhost:3001/?filepath=/Users/sudoupousei/000_work/temp/excalidraw/あああ.excalidraw
```

このURLでアクセスすると、指定されたファイルが読み込まれ、編集内容が自動的に保存されます。