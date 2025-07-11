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

### GET /api/file-info
ファイルの情報を取得します。

パラメータ:
- `filepath`: 確認するファイルのパス

### POST /api/save-file
ファイルを保存します。自動的にバックアップも作成されます。

リクエストボディ:
```json
{
  "filepath": "/path/to/file.excalidraw",
  "data": {
    "type": "excalidraw",
    "version": 2,
    "source": "https://excalidraw.com",
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

## 自動バックアップ機能

### 概要
ファイル保存時に自動的にバックアップが作成されます。

### バックアップの仕様
- **保存場所**: 元ファイルと同じディレクトリの `backup/` フォルダ
- **ファイル名**: `{元ファイル名}_backup_{00-09}.excalidraw`
- **最大保存数**: 10個（古いものから順次上書き）
- **保存条件**: 最新バックアップから5分以上経過した場合のみ作成

### 動作例
元ファイル: `/path/to/myfile.excalidraw`

バックアップファイル:
- `/path/to/backup/myfile_backup_00.excalidraw`
- `/path/to/backup/myfile_backup_01.excalidraw`
- `/path/to/backup/myfile_backup_02.excalidraw`
- ...

### 注意事項
- バックアップは5分間隔で制限されています
- 10個を超えると古いバックアップが上書きされます
- バックアップ作成に失敗しても元ファイルの保存は継続されます