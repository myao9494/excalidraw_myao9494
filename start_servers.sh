#!/bin/zsh

# サーバー一括起動スクリプト（M1 Mac / Python標準ライブラリ対応）
# バックエンドサーバー1つでAPI＋フロントエンド（PWA）を配信

set -e

echo "=== Excalidraw サーバーの起動を開始します ==="

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
free_port 3001

# 変更の反映忘れを防ぐため、常にフロントエンドをビルドする
echo "フロントエンドのビルドを実行しています..."
npm run build

# バックエンドサーバーの起動（port 3001）
# フロントエンド（dist/）も同じサーバーから配信
echo "サーバーを起動中... (port 3001)"
cd backend
if [ -d ".venv" ]; then
    .venv/bin/python -m uvicorn main:app --reload --host 0.0.0.0 --port 3001 &
elif [ -d "venv" ]; then
    ./venv/bin/python -m uvicorn main:app --reload --host 0.0.0.0 --port 3001 &
else
    python -m uvicorn main:app --reload --host 0.0.0.0 --port 3001 &
fi
BACKEND_PID=$!
cd ..

# プロセス終了処理
cleanup() {
    echo ""
    echo "=== サーバーを停止しています ==="
    kill $BACKEND_PID 2>/dev/null || true
    echo "サーバーが停止されました"
    exit 0
}

# Ctrl+Cで終了時にクリーンアップ
trap cleanup SIGINT SIGTERM

echo ""
echo "=== サーバー起動完了 ==="
echo "アプリケーション: http://localhost:3001"
echo "バックエンド API: http://localhost:3001/api/"
echo ""
echo "※ PWA対応: バックエンドからフロントエンドを配信"
echo "停止するには Ctrl+C を押してください"

# バックグラウンドプロセスの完了を待機
wait