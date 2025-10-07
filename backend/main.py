from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from pathlib import Path
import json
import os
import sys
import time
import shutil
import subprocess
import mimetypes
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional

app = FastAPI(title="Excalidraw File API")

# CORS設定 - 開発環境と本番環境の両方に対応
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://127.0.0.1:3001", 
        "http://0.0.0.0:3001",
        "*"  # 開発時の柔軟性のため
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# データモデル
class ExcalidrawElement(BaseModel):
    type: str
    x: float
    y: float
    width: float
    height: float
    angle: float
    strokeColor: str
    backgroundColor: str
    fillStyle: str
    strokeWidth: int
    strokeStyle: str
    roughness: int
    opacity: int
    groupIds: List[str]
    frameId: Optional[str]
    roundness: Optional[Dict[str, Any]]
    seed: int
    versionNonce: int
    isDeleted: bool
    boundElements: Optional[List[Any]]
    updated: int
    link: Optional[str]
    locked: bool
    id: str

class ExcalidrawAppState(BaseModel):
    viewBackgroundColor: Optional[str] = None
    gridSize: Optional[int] = None
    currentItemStrokeColor: Optional[str] = None
    currentItemBackgroundColor: Optional[str] = None
    currentItemFillStyle: Optional[str] = None
    currentItemStrokeWidth: Optional[int] = None
    currentItemStrokeStyle: Optional[str] = None
    currentItemRoughness: Optional[int] = None
    currentItemOpacity: Optional[int] = None
    zoom: Optional[Dict[str, float]] = None
    scrollX: Optional[float] = None
    scrollY: Optional[float] = None

class ExcalidrawFileData(BaseModel):
    type: str = "excalidraw"
    version: int = 2
    source: str = "https://excalidraw.com"
    elements: List[Dict[str, Any]]
    appState: Dict[str, Any]
    files: Dict[str, Any] = {}

class SaveFileRequest(BaseModel):
    filepath: str
    data: ExcalidrawFileData
    force_backup: bool = False  # デフォルトは自動保存扱い（10分制限あり）

class SaveEmailRequest(BaseModel):
    emailData: str
    subject: str
    currentPath: str

class FileUploadResponse(BaseModel):
    success: bool
    files: List[Dict[str, Any]] = []
    error: Optional[str] = None

class FolderShortcutResponse(BaseModel):
    success: bool
    folderPath: Optional[str] = None
    error: Optional[str] = None

class EmailSaveResponse(BaseModel):
    success: bool
    savedPath: Optional[str] = None
    error: Optional[str] = None

class SaveLibraryRequest(BaseModel):
    file_path: str
    data: Dict[str, Any]

class SaveLibraryResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None

class SaveSvgRequest(BaseModel):
    filepath: str
    svg_content: str

class OpenFolderRequest(BaseModel):
    path: str

class OpenFolderResponse(BaseModel):
    success: bool
    openedPath: Optional[str] = None
    error: Optional[str] = None

class ListDirectoryRequest(BaseModel):
    path: Optional[str] = None
    show_hidden: bool = False


class DirectoryEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: Optional[int] = None
    modified: Optional[float] = None


class ListDirectoryResponse(BaseModel):
    success: bool
    path: str
    parentPath: Optional[str] = None
    entries: List[DirectoryEntry] = Field(default_factory=list)
    error: Optional[str] = None

def create_backup(filepath: str, force: bool = False) -> bool:
    """
    バックアップシステム
    - force=False: 10分間隔でバックアップを作成（自動保存）
    - force=True: 時間制限なしでバックアップを作成（手動更新時）
    - 前日の最新のみ残す
    - 2週間以上古いものは自動削除
    - ファイル名に日時（秒まで）を含める
    """
    try:
        file_path = Path(filepath)
        
        # ファイルが存在しない場合はバックアップ不要
        if not file_path.exists():
            return True
            
        # backupフォルダの作成
        backup_dir = file_path.parent / "backup"
        backup_dir.mkdir(exist_ok=True)
        
        # ファイル名からバックアップ名を生成
        base_name = file_path.stem
        extension = file_path.suffix
        
        current_time = datetime.now()
        current_timestamp = current_time.timestamp()
        
        # 既存のバックアップファイルをチェック
        existing_backups = []
        pattern = f"{base_name}_backup_*{extension}"
        
        for backup_file in backup_dir.glob(pattern):
            try:
                backup_time = backup_file.stat().st_mtime
                existing_backups.append((backup_file, backup_time))
            except OSError:
                continue
        
        # 10分以内（600秒）にバックアップがある場合はスキップ（強制モードでない場合のみ）
        if not force and existing_backups:
            latest_backup_time = max(existing_backups, key=lambda x: x[1])[1]
            if (current_timestamp - latest_backup_time) < 600:
                print(f"Skip backup: Last backup was {int(current_timestamp - latest_backup_time)} seconds ago")
                return True
        
        # 2週間以上古いバックアップを削除
        two_weeks_ago = current_timestamp - (14 * 24 * 3600)
        for backup_file, backup_time in existing_backups:
            if backup_time < two_weeks_ago:
                try:
                    backup_file.unlink()
                    print(f"Deleted old backup (>2 weeks): {backup_file}")
                except OSError as e:
                    print(f"Failed to delete old backup {backup_file}: {e}")
        
        # 前日の最新以外を削除
        if existing_backups:
            # 残存するバックアップを再取得
            remaining_backups = []
            for backup_file in backup_dir.glob(pattern):
                try:
                    backup_time = backup_file.stat().st_mtime
                    remaining_backups.append((backup_file, backup_time))
                except OSError:
                    continue
            
            # 日付ごとにグループ化
            daily_backups = {}
            for backup_file, backup_time in remaining_backups:
                backup_date = datetime.fromtimestamp(backup_time).date()
                if backup_date not in daily_backups:
                    daily_backups[backup_date] = []
                daily_backups[backup_date].append((backup_file, backup_time))
            
            # 各日付で最新のもの以外を削除
            today = current_time.date()
            for backup_date, day_backups in daily_backups.items():
                if backup_date != today and len(day_backups) > 1:
                    # 最新のもの以外を削除
                    day_backups.sort(key=lambda x: x[1])  # 時刻でソート
                    for backup_file, _ in day_backups[:-1]:  # 最新以外
                        try:
                            backup_file.unlink()
                            print(f"Deleted old daily backup: {backup_file}")
                        except OSError as e:
                            print(f"Failed to delete daily backup {backup_file}: {e}")
        
        # 新しいバックアップファイル名を生成（秒まで含む）
        timestamp_str = current_time.strftime("%Y%m%d_%H%M%S")
        backup_name = f"{base_name}_backup_{timestamp_str}{extension}"
        backup_path = backup_dir / backup_name
        
        # バックアップを作成
        shutil.copy2(file_path, backup_path)
        if force:
            print(f"Forced backup created: {backup_path}")
        else:
            print(f"Backup created: {backup_path}")
        
        return True

    except Exception as e:
        print(f"Error creating backup: {e}")
        return False


def has_meaningful_content(file_data: Dict[str, Any]) -> bool:
    """保存対象に有効なコンテンツが含まれているかを判定"""
    if not file_data:
        return False

    elements = file_data.get("elements") or []
    for element in elements:
        if not isinstance(element, dict):
            continue
        if not element.get("isDeleted", False):
            return True

    files = file_data.get("files") or {}
    if isinstance(files, dict) and len(files) > 0:
        return True

    return False

def get_upload_directory(file_path: str, file_type: str = "general") -> Path:
    """アップロードディレクトリを取得/作成"""
    # ローカルストレージ用のパスかどうかをチェック
    if file_path == '/Users/sudoupousei/000_work/excalidraw_myao9494/test/test.excalidraw':
        # デフォルトのテストファイルの場合は通常のuploadsディレクトリ
        base_dir = Path(file_path).parent
        upload_dir = base_dir / "uploads"
    elif not file_path or file_path.startswith('localStorage'):
        # ローカルストレージの場合はプロジェクトルートのupload_localディレクトリ
        base_dir = Path(__file__).parent.parent  # プロジェクトルート
        upload_dir = base_dir / "upload_local"
    else:
        # 通常のファイルパスの場合は従来通り
        base_dir = Path(file_path).parent
        upload_dir = base_dir / "uploads"
    
    if file_type == "email":
        upload_dir = upload_dir / "emails"
    elif file_type == "image":
        upload_dir = upload_dir / "images"
    elif file_type == "folder":
        upload_dir = upload_dir / "folders"
    else:
        upload_dir = upload_dir / "files"
    
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir

def sanitize_filename(filename: str) -> str:
    """ファイル名をサニタイズ"""
    # 危険な文字を除去
    import re
    filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
    # 先頭末尾の空白とドットを除去
    filename = filename.strip(' .')
    # 空文字の場合はデフォルト名
    if not filename:
        filename = "untitled"
    return filename

@app.get("/")
async def root():
    return {"message": "Excalidraw File API"}

@app.get("/api/load-file")
async def load_file(filepath: str):
    try:
        # URLデコードを明示的に行う（ダブルクォートを含む文字列に対応）
        import urllib.parse
        decoded_filepath = urllib.parse.unquote_plus(filepath)
        print(f"[DEBUG] Original filepath: {filepath}")
        print(f"[DEBUG] Decoded filepath: {decoded_filepath}")
        
        file_path = Path(decoded_filepath)
        
        # ファイルが存在しない場合
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # ファイルの更新日時を取得
        file_modified_time = file_path.stat().st_mtime
        
        # ファイルを読み込み
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # ファイルデータに更新日時を追加
        return {
            "data": data,
            "modified": file_modified_time
        }
    
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading file: {str(e)}")

@app.get("/api/file-info")
async def get_file_info(filepath: str):
    try:
        # URLデコードを明示的に行う（ダブルクォートを含む文字列に対応）
        import urllib.parse
        decoded_filepath = urllib.parse.unquote_plus(filepath)
        print(f"[DEBUG] Original filepath: {filepath}")
        print(f"[DEBUG] Decoded filepath: {decoded_filepath}")
        
        file_path = Path(decoded_filepath)
        
        # ファイルが存在しない場合
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # ファイルの更新日時を取得
        file_modified_time = file_path.stat().st_mtime
        
        return {
            "modified": file_modified_time,
            "exists": True
        }
    
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting file info: {str(e)}")


@app.get("/api/open-file")
async def open_file(filepath: str):
    """任意のファイルをバックエンド経由で配信"""
    try:
        import urllib.parse

        decoded_filepath = urllib.parse.unquote_plus(filepath)
        file_path = Path(decoded_filepath)

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        if file_path.is_dir():
            raise HTTPException(status_code=400, detail="Path points to a directory")

        guessed_type, _ = mimetypes.guess_type(str(file_path))
        media_type = guessed_type or "application/octet-stream"

        return FileResponse(
            path=str(file_path),
            filename=file_path.name,
            media_type=media_type,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error opening file: {str(e)}")

@app.post("/api/save-file")
async def save_file(request: SaveFileRequest):
    try:
        file_path = Path(request.filepath)

        data_to_save = request.data.dict()
        if not has_meaningful_content(data_to_save):
            existing_has_content = False
            if file_path.exists():
                try:
                    with open(file_path, 'r', encoding='utf-8') as existing_file:
                        existing_data = json.load(existing_file)
                        existing_has_content = has_meaningful_content(existing_data)
                except Exception as exc:
                    print(f"Warning: Failed to inspect existing file for content: {exc}")

            message = "保存対象のデータが空のため保存をスキップしました。"
            if existing_has_content:
                message += " 既存のファイルは変更されていません。"

            return {"success": False, "message": message}

        # ディレクトリが存在しない場合は作成
        file_path.parent.mkdir(parents=True, exist_ok=True)

        # バックアップを作成（強制バックアップオプションを使用）
        backup_success = create_backup(request.filepath, force=request.force_backup)
        if not backup_success:
            print("Warning: Backup creation failed, but continuing with file save")

        # ファイルに保存
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data_to_save, f, ensure_ascii=False, indent=2)

        return {"success": True, "message": f"File saved to {request.filepath}"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

@app.post("/api/upload-files")
async def upload_files(
    files: List[UploadFile] = File(...),
    current_path: str = Form(...),
    file_type: str = Form("general")
):
    try:
        if not files:
            raise HTTPException(status_code=400, detail="No files provided")
        
        # アップロードディレクトリを取得
        upload_dir = get_upload_directory(current_path, file_type)
        
        uploaded_files = []
        
        for file in files:
            if not file.filename:
                continue
                
            # ファイル名をサニタイズ
            safe_filename = sanitize_filename(file.filename)
            
            # 重複回避のためタイムスタンプを追加
            timestamp = str(int(time.time()))
            name, ext = os.path.splitext(safe_filename)
            unique_filename = f"{name}_{timestamp}{ext}"
            
            file_path = upload_dir / unique_filename
            
            # ファイルを保存
            with open(file_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
            
            uploaded_files.append({
                "name": file.filename,
                "path": str(file_path),
                "size": len(content)
            })
        
        return FileUploadResponse(
            success=True,
            files=uploaded_files
        )
        
    except Exception as e:
        import traceback
        print("Upload error:", str(e))
        print("Traceback:", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error uploading files: {str(e)}")

@app.post("/api/create-folder-shortcut")
async def create_folder_shortcut(
    folder_path: str = Form(...),
    current_path: str = Form(...)
):
    try:
        # フォルダショートカット用ディレクトリを取得
        upload_dir = get_upload_directory(current_path, "folder")
        
        # フォルダ名を取得
        folder_name = os.path.basename(folder_path.rstrip('/\\'))
        if not folder_name:
            folder_name = "folder"
        
        # ショートカットファイルを作成
        timestamp = str(int(time.time()))
        shortcut_filename = f"{sanitize_filename(folder_name)}_{timestamp}.txt"
        shortcut_path = upload_dir / shortcut_filename
        
        # ショートカット内容を作成
        shortcut_content = f"Folder Shortcut\nPath: {folder_path}\nCreated: {time.strftime('%Y-%m-%d %H:%M:%S')}"
        
        with open(shortcut_path, "w", encoding="utf-8") as f:
            f.write(shortcut_content)
        
        return FolderShortcutResponse(
            success=True,
            folderPath=str(shortcut_path)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating folder shortcut: {str(e)}")

@app.post("/api/save-email")
async def save_email(request: SaveEmailRequest):
    try:
        # メール用ディレクトリを取得
        upload_dir = get_upload_directory(request.currentPath, "email")
        
        # 件名をファイル名として使用
        safe_subject = sanitize_filename(request.subject)
        if not safe_subject:
            safe_subject = "email"
        
        # タイムスタンプを追加
        timestamp = str(int(time.time()))
        email_filename = f"{safe_subject}_{timestamp}.eml"
        email_path = upload_dir / email_filename
        
        # メールデータを保存
        with open(email_path, "w", encoding="utf-8") as f:
            f.write(f"Subject: {request.subject}\n")
            f.write(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Content-Type: text/plain; charset=utf-8\n\n")
            f.write(request.emailData)
        
        return EmailSaveResponse(
            success=True,
            savedPath=str(email_path)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving email: {str(e)}")

@app.post("/save-library")
async def save_library(request: SaveLibraryRequest):
    """ライブラリファイルを保存するエンドポイント"""
    try:
        # プロジェクトルートからの相対パスを解決
        project_root = Path(__file__).parent.parent  # backendディレクトリの親ディレクトリ
        file_path = project_root / request.file_path
        
        # ディレクトリが存在しない場合は作成
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # ライブラリファイルに保存
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(request.data, f, ensure_ascii=False, indent=2)
        
        return SaveLibraryResponse(
            success=True,
            message=f"Library saved to {file_path}"
        )
    
    except Exception as e:
        print(f"Error saving library: {str(e)}")
        return SaveLibraryResponse(
            success=False,
            error=f"Error saving library: {str(e)}"
        )

@app.post("/api/save-svg")
async def save_svg(request: SaveSvgRequest):
    """SVGファイルを保存するエンドポイント"""
    try:
        file_path = Path(request.filepath)
        
        # ディレクトリが存在しない場合は作成
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # SVGファイルに保存
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(request.svg_content)
        
        return {"success": True, "message": f"SVG file saved to {request.filepath}"}
    
    except Exception as e:
        print(f"Error saving SVG file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error saving SVG file: {str(e)}")

# フォルダをOSのファイルマネージャーで開く
@app.post("/api/open-folder", response_model=OpenFolderResponse)
async def open_folder(request: OpenFolderRequest):
    try:
        if not request.path:
            raise HTTPException(status_code=400, detail="Folder path is required")

        target_path = Path(request.path).expanduser()

        # ファイルが指定された場合は親ディレクトリを対象にする
        if target_path.is_file():
            target_path = target_path.parent

        if not target_path.exists():
            raise HTTPException(status_code=404, detail="Folder not found")

        resolved_path = target_path.resolve()

        if sys.platform.startswith("win"):
            subprocess.Popen(["explorer", str(resolved_path)])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(resolved_path)])
        else:
            subprocess.Popen(["xdg-open", str(resolved_path)])

        return OpenFolderResponse(success=True, openedPath=str(resolved_path))

    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Folder not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error opening folder: {str(e)}")


@app.post("/api/list-directory", response_model=ListDirectoryResponse)
async def list_directory(request: ListDirectoryRequest):
    try:
        target_path = Path(request.path).expanduser() if request.path else Path.cwd()
        if not target_path.exists():
            raise HTTPException(status_code=404, detail="Directory not found")
        if not target_path.is_dir():
            raise HTTPException(status_code=400, detail="Target path is not a directory")

        resolved_path = target_path.resolve()
        entries: List[DirectoryEntry] = []

        for entry in resolved_path.iterdir():
            if not request.show_hidden and entry.name.startswith('.'):
                continue

            try:
                is_dir = entry.is_dir()
            except (PermissionError, FileNotFoundError):
                continue

            if not is_dir:
                name_lower = entry.name.lower()
                if not name_lower.endswith('.excalidraw'):
                    continue

            try:
                stat = entry.stat()
            except (PermissionError, FileNotFoundError):
                continue

            entries.append(
                DirectoryEntry(
                    name=entry.name,
                    path=str(entry.resolve()),
                    is_dir=is_dir,
                    size=None if is_dir else stat.st_size,
                    modified=stat.st_mtime,
                )
            )

        entries.sort(key=lambda item: (not item.is_dir, item.name.lower()))

        parent_path = None
        if resolved_path.parent != resolved_path:
            parent_path = str(resolved_path.parent)

        return ListDirectoryResponse(
            success=True,
            path=str(resolved_path),
            parentPath=parent_path,
            entries=entries,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing directory: {str(e)}")


# 静的ファイル配信の設定
@app.get("/api/file/{file_path:path}")
async def serve_uploaded_file(file_path: str):
    """アップロードされたファイルを配信"""
    try:
        # セキュリティのため、uploads/upload_local ディレクトリ内のファイルのみ許可
        if not (file_path.startswith('uploads/') or file_path.startswith('upload_local/')):
            raise HTTPException(status_code=403, detail="Access denied")
        
        # ファイルの実際のパスを構築
        # file_path は "uploads/files/filename.pdf" または "upload_local/files/filename.pdf" のような形式
        base_path = Path(file_path).parts[0]  # "uploads" or "upload_local"
        if len(Path(file_path).parts) < 3:
            raise HTTPException(status_code=400, detail="Invalid file path")
        
        # ファイルパスから基準ディレクトリを推測
        if file_path.startswith('upload_local/'):
            # ローカルストレージ用ファイルの場合はプロジェクトルートから
            actual_file_path = Path(__file__).parent.parent / file_path
        else:
            # 通常は excalidraw ファイルと同じディレクトリ構造
            actual_file_path = Path(file_path)
        
        # ファイルが存在するか確認
        if not actual_file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # ファイルを返す
        return FileResponse(
            path=str(actual_file_path),
            filename=actual_file_path.name,
            media_type='application/octet-stream'
        )
    
    except Exception as e:
        print(f"Error serving file {file_path}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error serving file: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8008)
