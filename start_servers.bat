@echo off
chcp 65001

REM サーバー一括起動スクリプト（Windows用 / オフライン環境対応）
REM buildされたフロントエンドとバックエンドサーバーを同時に起動
REM ポート3001使用、Python標準ライブラリのみ使用

echo === Excalidraw サーバー群の起動を開始します ===

REM プロジェクトディレクトリに移動
cd /d %~dp0

REM バックエンドサーバーの起動（port 8000）
echo バックエンドサーバーを起動中... (port 8000)
start "Backend Server" cmd /k "cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

REM 少し待機
timeout /t 3 /nobreak > nul

REM フロントエンドサーバーの起動（port 3001）- Python標準ライブラリのみ使用
echo フロントエンドサーバーを起動中... (port 3001)
start "Frontend Server" cmd /k "cd dist && python -m http.server 3001"

echo.
echo === サーバー起動完了 ===
echo フロントエンド: http://localhost:3001
echo バックエンド API: http://localhost:8000
echo.
echo 各サーバーは別ウィンドウで起動されました
echo 停止するには各ウィンドウを閉じてください
echo.
echo ※ オフライン環境対応: Python標準ライブラリのみ使用
echo.
pause