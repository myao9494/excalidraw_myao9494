from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import json
import os
import time
import shutil
from typing import Dict, List, Any, Optional

app = FastAPI(title="Excalidraw File API")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001"],  # フロントエンドのURL
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

def create_backup(filepath: str) -> bool:
    """バックアップを作成する関数"""
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
        for i in range(10):
            backup_name = f"{base_name}_backup_{i:02d}{extension}"
            backup_path = backup_dir / backup_name
            
            if backup_path.exists():
                backup_time = backup_path.stat().st_mtime
                if backup_time > latest_backup_time:
                    latest_backup_time = backup_time
        
        # 5分以内（300秒）にバックアップがある場合はスキップ
        if latest_backup_time > 0 and (current_time - latest_backup_time) < 300:
            print(f"Skip backup: Last backup was {int(current_time - latest_backup_time)} seconds ago")
            return True
        
        # バックアップファイルのローテーション
        # 既存のバックアップファイルを確認して次のインデックスを決定
        oldest_backup = None
        oldest_time = float('inf')
        next_index = 0
        
        for i in range(10):
            backup_name = f"{base_name}_backup_{i:02d}{extension}"
            backup_path = backup_dir / backup_name
            
            if backup_path.exists():
                backup_time = backup_path.stat().st_mtime
                if backup_time < oldest_time:
                    oldest_time = backup_time
                    oldest_backup = backup_path
                    next_index = i
            else:
                # 空いているスロットがあればそれを使用
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)