#!/bin/zsh

# 開発用サーバー一括起動スクリプト
# Vite開発サーバー(HMR)とバックエンドサーバーを同時に起動

set -e

echo "=== Excalidraw 開発用サーバーの起動を開始します ==="

# プロジェクトディレクトリに移動
cd "$(dirname "$0")"

# 特定ポートを解放する関数
free_port() {
    local port=$1
    local pids
    pids=$(lsof -ti tcp:$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Port $port を使用しているプロセスを終了します..."
        echo "$pids" | xargs -r kill -9
    fi
}

# 使用ポートの事前解放
free_port 8008
free_port 3001 # Viteの設定ファイルに合わせる

# バックエンドサーバーの起動（port 8008）
echo "バックエンドサーバーを起動中... (port 8008)"
(cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8008) &
BACKEND_PID=$!

# フロントエンド開発サーバーの起動（Vite）
echo "フロントエンド開発サーバーを起動中... (Vite)"
npm start & # package.jsonの "start": "vite" を実行
FRONTEND_PID=$!

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
echo "=== 開発用サーバー起動完了 ==="
echo "フロントエンド (Vite): http://localhost:3001"
echo "(もしポートが使用中の場合、Viteが自動的に別のポートで起動します)"
echo "バックエンド API:    http://localhost:8008"
echo ""
echo "ソースコードを変更すると、ブラウザは自動的に更新されます。"
echo "停止するには Ctrl+C を押してください"

# バックグラウンドプロセスの完了を待機
wait
