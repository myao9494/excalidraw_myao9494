#!/bin/zsh

# サーバー一括起動スクリプト（M1 Mac / Python標準ライブラリ対応）
# buildされたフロントエンドとバックエンドサーバーを同時に起動

set -e

echo "=== Excalidraw サーバー群の起動を開始します ==="

# プロジェクトディレクトリに移動
cd "$(dirname "$0")"

# バックエンドサーバーの起動（port 8000）
echo "バックエンドサーバーを起動中... (port 8000)"
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# フロントエンドサーバーの起動（port 3001）- Python標準ライブラリのみ使用
echo "フロントエンドサーバーを起動中... (port 3001)"
cd dist
python -m http.server 3001 &
FRONTEND_PID=$!
cd ..

# プロセス終了処理
cleanup() {
    echo ""
    echo "=== サーバーを停止しています ==="
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "すべてのサーバーが停止されました"
    exit 0
}

# Ctrl+Cで終了時にクリーンアップ
trap cleanup SIGINT SIGTERM

echo ""
echo "=== サーバー起動完了 ==="
echo "フロントエンド: http://localhost:3001"
echo "バックエンド API: http://localhost:8000"
echo ""
echo "※ オフライン環境対応: Python標準ライブラリのみ使用"
echo "停止するには Ctrl+C を押してください"

# バックグラウンドプロセスの完了を待機
wait