from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
import json
import os
import time
import shutil
from typing import Dict, List, Any, Optional

app = FastAPI(title="Excalidraw File API")

# CORS設定 - Tailscale VPN対応
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # VPNアクセス用に全許可
    allow_credentials=True,
    allow_methods=["*"],
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

def create_backup(filepath: str) -> bool:
    """
    バックアップを作成する関数
    10個を超えた場合、最も古いバックアップを削除して新しいバックアップを保存
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
        
        # 最新のバックアップがあるかチェック（5分以内かどうか）
        current_time = time.time()
        latest_backup_time = 0
        
        # 既存のバックアップファイルから最新のものを見つける
        existing_backups = []
        for i in range(10):
            backup_name = f"{base_name}_backup_{i:02d}{extension}"
            backup_path = backup_dir / backup_name
            
            if backup_path.exists():
                backup_time = backup_path.stat().st_mtime
                existing_backups.append((backup_path, backup_time))
                if backup_time > latest_backup_time:
                    latest_backup_time = backup_time
        
        # 5分以内（300秒）にバックアップがある場合はスキップ
        if latest_backup_time > 0 and (current_time - latest_backup_time) < 300:
            print(f"Skip backup: Last backup was {int(current_time - latest_backup_time)} seconds ago")
            return True
        
        # バックアップファイルのローテーション
        if len(existing_backups) >= 10:
            # 10個以上の場合、最も古いものを削除
            existing_backups.sort(key=lambda x: x[1])  # 時刻でソート
            oldest_backup_path = existing_backups[0][0]
            oldest_backup_path.unlink()  # 古いバックアップを削除
            print(f"Deleted oldest backup: {oldest_backup_path}")
        
        # 新しいバックアップファイルの名前を決定
        # 削除されたスロットまたは空いているスロットを使用
        next_index = 0
        for i in range(10):
            backup_name = f"{base_name}_backup_{i:02d}{extension}"
            backup_path = backup_dir / backup_name
            if not backup_path.exists():
                next_index = i
                break
        
        # バックアップファイル名を作成
        backup_name = f"{base_name}_backup_{next_index:02d}{extension}"
        backup_path = backup_dir / backup_name
        
        # バックアップを作成
        shutil.copy2(file_path, backup_path)
        print(f"Backup created: {backup_path}")
        
        return True
        
    except Exception as e:
        print(f"Error creating backup: {e}")
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
        file_path = Path(filepath)
        
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
        file_path = Path(filepath)
        
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

@app.post("/api/save-file")
async def save_file(request: SaveFileRequest):
    try:
        file_path = Path(request.filepath)
        
        # ディレクトリが存在しない場合は作成
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # バックアップを作成
        backup_success = create_backup(request.filepath)
        if not backup_success:
            print("Warning: Backup creation failed, but continuing with file save")
        
        # ファイルに保存
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(request.data.dict(), f, ensure_ascii=False, indent=2)
        
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
    uvicorn.run(app, host="0.0.0.0", port=8000)