#!/bin/zsh

# 開発環境サーバー一括起動スクリプト（M1 Mac対応）
# 開発モードでフロントエンドとバックエンドサーバーを同時に起動

set -e

echo "=== Excalidraw 開発環境の起動を開始します ==="

# プロジェクトディレクトリに移動
cd "$(dirname "$0")"

# バックエンドサーバーの起動（開発モード、port 8000）
echo "バックエンドサーバーを起動中... (開発モード, port 8000)"
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# フロントエンドサーバーの起動（Vite開発サーバー、port 3001）
echo "フロントエンドサーバーを起動中... (Vite開発サーバー, port 3001)"
npm start &
FRONTEND_PID=$!

# プロセス終了処理
cleanup() {
    echo ""
    echo "=== 開発サーバーを停止しています ==="
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "すべての開発サーバーが停止されました"
    exit 0
}

# Ctrl+Cで終了時にクリーンアップ
trap cleanup SIGINT SIGTERM

echo ""
echo "=== 開発環境起動完了 ==="
echo "フロントエンド（開発）: http://localhost:3001"
echo "バックエンド API: http://localhost:8000"
echo ""
echo "※ ホットリロード対応: ファイル変更時に自動更新"
echo "停止するには Ctrl+C を押してください"

# バックグラウンドプロセスの完了を待機
wait