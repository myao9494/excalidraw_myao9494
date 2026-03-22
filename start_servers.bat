@echo off
chcp 65001 > nul
setlocal

REM サーバー一括起動スクリプト（Windows用）
REM バックエンドサーバー1つでAPI＋フロントエンド（PWA）を配信

echo === Excalidraw サーバーの起動を開始します ===

REM プロジェクトディレクトリに移動
cd /d %~dp0
set "ROOT_DIR=%CD%"

REM 変更の反映忘れを防ぐため、常にフロントエンドをビルドする
echo フロントエンドのビルドを実行しています...
call npm run build
if errorlevel 1 (
  echo ビルドに失敗しました。
  exit /b 1
)

REM 利用する Python を決定
set "PYTHON_EXE=python"
if exist "%ROOT_DIR%\backend\.venv\Scripts\python.exe" set "PYTHON_EXE=%ROOT_DIR%\backend\.venv\Scripts\python.exe"
if exist "%ROOT_DIR%\.venv\Scripts\python.exe" set "PYTHON_EXE=%ROOT_DIR%\.venv\Scripts\python.exe"

echo サーバーを起動中... (port 3001)
start "Excalidraw Server" cmd /k "cd /d backend && %PYTHON_EXE% -m uvicorn main:app --reload --host 0.0.0.0 --port 3001"

echo.
echo === サーバー起動完了 ===
echo アプリケーション: http://localhost:3001
echo バックエンド API: http://localhost:3001/api/
echo.
echo ※ PWA対応: バックエンドからフロントエンドを配信
echo 停止するには起動したウィンドウを閉じてください
echo.
pause
