from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field
from pathlib import Path
from html import escape, unescape
import asyncio
import json
import os
import sys
import time
import shutil
import subprocess
import hashlib
import traceback
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import re
from lzstring import LZString

def is_obsidian_path(filepath: str) -> bool:
    """
    パスがObsidian管理下にあるか判定する。
    - パスに 'obsidian' (case-insensitive) が含まれる
    - 拡張子が .excalidraw.md または .excalidraw
    """
    path_str = str(filepath).lower()
    if 'obsidian' not in path_str:
        return False
    
    # 移行対象の .excalidraw, および正当な .excalidraw.md を対象とする
    return path_str.endswith('.excalidraw.md') or path_str.endswith('.excalidraw')

def extract_json_from_markdown(content: str) -> str:
    """
    MarkdownからExcalidraw JSONを抽出する。
    圧縮されている場合は解凍する。
    """
    # ```compressed-json ... ``` または ```json ... ``` ブロックを探す
    match = re.search(r'```(?:compressed-json|json)\n(.*?)\n```', content, re.DOTALL)
    if not match:
        raise ValueError("No JSON block found in Markdown")

    # 改行を含む可能性があるので、すべての空白文字（改行含む）を除去
    json_content = match.group(1).strip()

    # JSONとしてパースできるか試みる (非圧縮)
    try:
        json.loads(json_content)
        return json_content
    except json.JSONDecodeError:
        pass

    # パースできなければ圧縮されているとみなして解凍を試みる
    # 圧縮データから改行を除去（Obsidianは複数行に分割して保存する）
    try:
        lz = LZString()
        # すべての改行と空白を除去
        compressed_clean = ''.join(json_content.split())
        decompressed = lz.decompressFromBase64(compressed_clean)
        if not decompressed:
             # 解凍結果が空、または失敗した場合
            raise ValueError("Failed to decompress JSON content")
        # 解凍結果が正当なJSONかチェック
        json.loads(decompressed)
        return decompressed
    except Exception as e:
        raise ValueError(f"Failed to extract/decompress JSON: {e}")

def embed_json_into_markdown(original_content: Optional[str], json_str: str, image_files: Optional[dict] = None) -> str:
    """
    MarkdownにJSONを埋め込む。
    - JSONはLZStringで圧縮する。
    - original_contentがある場合は、既存のJSONブロックを置換する。
    - ない場合は新規テンプレートを作成する。
    - image_filesがある場合、## Embedded Filesセクションを追加
    - JSONからテキスト要素を抽出して ## Text Elements セクションに記載
    """
    lz = LZString()
    compressed = lz.compressToBase64(json_str)
    # Obsidianプラグインの動作に合わせて、256文字ごとに改行+空行を挿入
    lines = [compressed[i:i+256] for i in range(0, len(compressed), 256)]
    compressed = '\n\n'.join(lines)

    # JSONデータからテキスト要素を抽出
    text_elements_section = ""
    try:
        data = json.loads(json_str)
        elements = data.get("elements", [])
        text_elements = [el for el in elements if el.get("type") == "text" and not el.get("isDeleted", False)]

        if text_elements:
            for el in text_elements:
                text_content = el.get("text", "")
                element_id = el.get("id", "")
                if text_content and element_id:
                    # 改行文字を削除（Obsidianプラグインの動作に合わせる）
                    text_content = text_content.replace("\n", "").replace("\r", "").strip()
                    text_elements_section += f"{text_content} ^{element_id}\n\n"
            # 最後の余分な改行を削除
            text_elements_section = text_elements_section.rstrip('\n') + '\n'
    except Exception as e:
        print(f"Warning: Failed to extract text elements: {e}")

    # Embedded Filesセクションの生成
    embedded_files_section = ""
    if image_files:
        embedded_files_section = "## Embedded Files\n"
        for file_id, filename in image_files.items():
            embedded_files_section += f"{file_id}: [[{filename}]]\n"
        embedded_files_section += "\n"

    template = """---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'


# Excalidraw Data

## Text Elements
{TEXT_ELEMENTS}{EMBEDDED_FILES}%%
## Drawing
```compressed-json
{COMPRESSED_DATA}
```
%%"""

    if not original_content:
        content = template.replace("{COMPRESSED_DATA}", compressed)
        content = content.replace("{TEXT_ELEMENTS}", text_elements_section)
        content = content.replace("{EMBEDDED_FILES}", embedded_files_section)
        return content

    # 既存コンテンツがある場合、JSONブロック、Text Elements、Embedded Filesセクションを更新

    # 1. JSONブロックを置換（compressed-jsonとjsonの両方に対応）
    json_pattern = r'(```(?:compressed-json|json)\n)(.*?)(\n```)'

    # 既存のJSONブロックがあるか確認
    if not re.search(json_pattern, original_content, re.DOTALL):
        # 構造が壊れているか、まだブロックがない場合、末尾に追加
        content = original_content + f"\n\n%%\n## Drawing\n```compressed-json\n{compressed}\n```\n%%\n"
    else:
        # JSONブロックを置換
        def replace_json(match):
            return f"{match.group(1)}{compressed}{match.group(3)}"
        content = re.sub(json_pattern, replace_json, original_content, flags=re.DOTALL)

    # 2. Text Elementsセクションを更新
    if text_elements_section:
        # 既存のText Elementsセクション内容を置換（## Text Elements から次のセクションまたは%%まで）
        text_pattern = r'(## Text Elements\n)(.*?)(\n(?=##|%%))'
        if re.search(text_pattern, content, re.DOTALL):
            def replace_text(match):
                return f"{match.group(1)}{text_elements_section}{match.group(3)}"
            content = re.sub(text_pattern, replace_text, content, flags=re.DOTALL)
    else:
        # テキスト要素がない場合は空にする（既存の内容を削除）
        text_pattern = r'(## Text Elements\n)(.*?)(\n(?=##|%%))'
        if re.search(text_pattern, content, re.DOTALL):
            def replace_text(match):
                return f"{match.group(1)}{match.group(3)}"
            content = re.sub(text_pattern, replace_text, content, flags=re.DOTALL)

    # 3. Embedded Filesセクションを更新
    if image_files:
        embedded_files_text = "## Embedded Files\n"
        for file_id, filename in image_files.items():
            embedded_files_text += f"{file_id}: [[{filename}]]\n"
        embedded_files_text += "\n"

        # 既存のEmbedded Filesセクションを探す
        embedded_pattern = r'## Embedded Files\n(.*?)\n(?=##|%%)'
        if re.search(embedded_pattern, content, re.DOTALL):
            # 既存セクションを置換
            content = re.sub(embedded_pattern, embedded_files_text, content, flags=re.DOTALL)
        else:
            # Text Elementsの後、次のセクション（%%またはDrawing）の前に挿入
            text_elements_pattern = r'(## Text Elements\n(?:.*?\n)?)'
            if re.search(text_elements_pattern, content, re.DOTALL):
                # Text Elementsの後に挿入
                def insert_embedded(match):
                    return f"{match.group(1)}{embedded_files_text}"
                content = re.sub(text_elements_pattern, insert_embedded, content, count=1, flags=re.DOTALL)
            else:
                # Text Elementsもない場合、%%の前に挿入
                content = content.replace("%%\n## Drawing", f"{embedded_files_text}%%\n## Drawing")

    return content

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

# API呼び出しをログ出力するミドルウェア
@app.middleware("http")
async def log_api_calls(request, call_next):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [API Call] {request.method} {request.url.path}")
    response = await call_next(request)
    return response


@app.on_event("startup")
async def configure_logging() -> None:
    formatter = logging.Formatter("%(asctime)s %(levelname)s: %(message)s", "%Y-%m-%d %H:%M:%S")
    for logger_name in ("uvicorn.access", "uvicorn.error"):
        logger = logging.getLogger(logger_name)
        for handler in logger.handlers:
            handler.setFormatter(formatter)

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

class OpenFileRequest(BaseModel):
    filepath: str

class OpenFileResponse(BaseModel):
    success: bool
    targetType: Optional[str] = None
    resolvedPath: Optional[str] = None
    message: Optional[str] = None

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


class RunCommandRequest(BaseModel):
    command: str
    working_directory: Optional[str] = None


class RunCommandResponse(BaseModel):
    success: bool
    command: str
    pid: Optional[int] = None
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


def clean_surrogates(obj: Any) -> Any:
    """
    サロゲート文字を含むデータをクリーンアップする
    JSONレスポンスでUnicodeEncodeErrorが発生するのを防ぐ
    """
    if isinstance(obj, str):
        # サロゲート文字を置換してクリーンアップ
        return obj.encode('utf-8', errors='surrogatepass').decode('utf-8', errors='replace')
    elif isinstance(obj, dict):
        return {k: clean_surrogates(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_surrogates(item) for item in obj]
    else:
        return obj


def compute_data_hash(data: Any) -> str:
    """Returns a stable SHA-256 hash for predictable change detection."""
    canonical = json.dumps(
        data,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    # サロゲート文字を含む可能性があるため、errors="surrogatepass"を使用
    return hashlib.sha256(canonical.encode("utf-8", errors="surrogatepass")).hexdigest()


def load_json_file(file_path: Path) -> Any:
    with open(file_path, "r", encoding="utf-8") as file:
        return json.load(file)


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
                # print(f"Skip backup: Last backup was {int(current_timestamp - latest_backup_time)} seconds ago")
                return True
        
        # 2週間以上古いバックアップを削除
        two_weeks_ago = current_timestamp - (14 * 24 * 3600)
        for backup_file, backup_time in existing_backups:
            if backup_time < two_weeks_ago:
                try:
                    backup_file.unlink()
                    # print(f"Deleted old backup (>2 weeks): {backup_file}")
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
                            # print(f"Deleted old daily backup: {backup_file}")
                        except OSError as e:
                            print(f"Failed to delete daily backup {backup_file}: {e}")
        
        # 新しいバックアップファイル名を生成（秒まで含む）
        timestamp_str = current_time.strftime("%Y%m%d_%H%M%S")
        backup_name = f"{base_name}_backup_{timestamp_str}{extension}"
        backup_path = backup_dir / backup_name
        
        # バックアップを作成
        shutil.copy2(file_path, backup_path)
        # if force:
        #     print(f"Forced backup created: {backup_path}")
        # else:
        #     print(f"Backup created: {backup_path}")
        
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

def compute_relative_path(current_path: str, target_path: str) -> str:
    """
    現在のExcalidrawファイルの位置を基準とした相対パスを計算する。
    localStorageの場合は絶対パスをそのまま返す。
    """
    # localStorageの場合は相対パスを計算できないため、絶対パスを返す
    if not current_path or current_path.startswith('localStorage'):
        return target_path
    
    try:
        # 現在のファイルの親ディレクトリを基準とする
        base_dir = Path(current_path).parent
        target = Path(target_path)
        
        # 相対パスを計算
        relative = os.path.relpath(target, base_dir)
        
        # Windowsのバックスラッシュをスラッシュに統一
        relative = relative.replace('\\', '/')
        
        return relative
    except ValueError:
        # 異なるドライブ間など、相対パスを計算できない場合は絶対パスを返す
        return target_path

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
        # print(f"[DEBUG] Original filepath: {filepath}")
        # print(f"[DEBUG] Decoded filepath: {decoded_filepath}")
        
        file_path = Path(decoded_filepath)

        # Obsidian連携: パス判定と読み込み切り替え
        if is_obsidian_path(str(file_path)):
            # .excalidraw リクエストだが、.excalidraw.md が存在する場合はそちらを優先（移行済み対応）
            if file_path.suffix == '.excalidraw':
                md_path = file_path.with_suffix('.excalidraw.md')
                if md_path.exists():
                    file_path = md_path
            
            # Markdownファイルとして読み込む場合
            if str(file_path).endswith('.excalidraw.md'):
                if not file_path.exists():
                     raise HTTPException(status_code=404, detail="Obsidian file not found")
                
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()

                    # Embedded Filesセクションから画像ファイル名を読み取る
                    embedded_files_map = {}  # file_id -> filename
                    embedded_match = re.search(r'## Embedded Files\n(.*?)\n(?=##|%%)', content, re.DOTALL)
                    if embedded_match:
                        embedded_section = embedded_match.group(1)
                        # file_id: [[filename]] の形式を解析
                        for line in embedded_section.split('\n'):
                            if ':' in line and '[[' in line:
                                file_id = line.split(':')[0].strip()
                                filename_match = re.search(r'\[\[(.*?)\]\]', line)
                                if filename_match:
                                    filename = filename_match.group(1)
                                    embedded_files_map[file_id] = filename

                    json_str = extract_json_from_markdown(content)
                    data = json.loads(json_str)

                    # Embedded Filesセクションから画像を読み込んでfilesセクションに追加
                    import base64
                    files = data.get('files', {})
                    if not files:
                        files = {}
                        data['files'] = files

                    # Embedded Filesセクションの各画像を読み込む
                    for file_id, image_filename in embedded_files_map.items():
                        # 画像ファイルを探す（同じディレクトリまたは親ディレクトリ）
                        image_path = file_path.parent / image_filename
                        if not image_path.exists():
                            # 親ディレクトリも探す
                            image_path = file_path.parent.parent / image_filename

                        if image_path.exists():
                            try:
                                # 拡張子からmimeTypeを推測
                                ext = image_path.suffix.lower().lstrip('.')
                                mime_type = f"image/{ext}" if ext in ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] else 'image/png'

                                with open(image_path, 'rb') as img_file:
                                    image_bytes = img_file.read()

                                # base64エンコード
                                base64_data = base64.b64encode(image_bytes).decode('utf-8')

                                # dataURLを生成
                                data_url = f"data:{mime_type};base64,{base64_data}"

                                # filesセクションに追加
                                files[file_id] = {
                                    'mimeType': mime_type,
                                    'id': file_id,
                                    'dataURL': data_url,
                                    'created': int(image_path.stat().st_mtime * 1000)
                                }

                                print(f"Loaded image: {image_path}")
                            except Exception as e:
                                print(f"Warning: Failed to load image {image_filename}: {e}")
                        else:
                            print(f"Warning: Image file not found: {image_filename}")

                    # JSONに既にfilesがある場合、dataURLを補完
                    for file_id, file_data in list(files.items()):
                            # dataURLが存在しない場合、外部ファイルから読み込む
                            if 'dataURL' not in file_data:
                                mime_type = file_data.get('mimeType', 'image/png')
                                ext = mime_type.split('/')[-1] if '/' in mime_type else 'png'

                                # Embedded Filesセクションからファイル名を取得、なければfile_idから生成
                                if file_id in embedded_files_map:
                                    image_filename = embedded_files_map[file_id]
                                else:
                                    image_filename = f"{file_id[:8]}.{ext}"

                                # 画像ファイルを探す（同じディレクトリまたは親ディレクトリ）
                                image_path = file_path.parent / image_filename
                                if not image_path.exists():
                                    # 親ディレクトリも探す
                                    image_path = file_path.parent.parent / image_filename

                                # 画像ファイルが存在する場合、読み込む
                                if image_path.exists():
                                    try:
                                        with open(image_path, 'rb') as img_file:
                                            image_bytes = img_file.read()

                                        # base64エンコード
                                        base64_data = base64.b64encode(image_bytes).decode('utf-8')

                                        # dataURLを生成
                                        data_url = f"data:{mime_type};base64,{base64_data}"
                                        file_data['dataURL'] = data_url

                                        print(f"Loaded image: {image_path}")
                                    except Exception as e:
                                        print(f"Warning: Failed to load image {image_filename}: {e}")
                                else:
                                    print(f"Warning: Image file not found: {image_filename}")

                    data_hash = compute_data_hash(data)

                    # サロゲート文字をクリーンアップしてレスポンスを返す
                    clean_data = clean_surrogates(data)
                    return {
                        "data": clean_data,
                        "modified": 0,
                        "hash": data_hash,
                    }
                except Exception as e:
                    print(f"Error loading Obsidian file: {e}")
                    raise HTTPException(status_code=500, detail=f"Error parsing Obsidian file: {str(e)}")
        
        # ファイルが存在しない場合
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # ファイルを読み込み
        data = load_json_file(file_path)
        data_hash = compute_data_hash(data)

        # サロゲート文字をクリーンアップしてレスポンスを返す
        clean_data = clean_surrogates(data)
        return {
            "data": clean_data,
            "modified": 0,
            "hash": data_hash,
        }
    
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        print(f"An unexpected error occurred in load_file: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error loading file: {str(e)}")

@app.get("/api/file-info")
async def get_file_info(filepath: str):
    try:
        # URLデコードを明示的に行う（ダブルクォートを含む文字列に対応）
        import urllib.parse
        decoded_filepath = urllib.parse.unquote_plus(filepath)
        # print(f"[DEBUG] Original filepath: {filepath}")
        # print(f"[DEBUG] Decoded filepath: {decoded_filepath}")

        file_path = Path(decoded_filepath)

        # ファイルが存在しない場合
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        # Obsidianファイルの場合はMarkdownから抽出
        if is_obsidian_path(str(file_path)):
            with open(file_path, "r", encoding="utf-8") as f:
                markdown_content = f.read()
            json_str = extract_json_from_markdown(markdown_content)
            data = json.loads(json_str)
        else:
            data = load_json_file(file_path)

        data_hash = compute_data_hash(data)

        return {
            "modified": 0,
            "hash": data_hash,
            "exists": True,
        }

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        print(f"An unexpected error occurred in get_file_info: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error getting file info: {str(e)}")


def _normalize_filepath(raw_path: str) -> str:
    """Expand environment variables, user home, and trim quotes."""
    if raw_path is None:
        return ""
    trimmed = raw_path.strip()
    if trimmed.startswith('"') and trimmed.endswith('"') and len(trimmed) >= 2:
        trimmed = trimmed[1:-1]
    expanded = os.path.expandvars(os.path.expanduser(trimmed))
    return expanded


def _launch_with_system(path_str: str) -> None:
    """Open file or directory with the OS-specific default handler."""
    if sys.platform.startswith('win'):
        # UNC パスも含めて Windows の既定アプリに委譲
        os.startfile(path_str)  # type: ignore[attr-defined]
    elif sys.platform == 'darwin':
        subprocess.run(["open", path_str], check=True)
    else:
        subprocess.run(["xdg-open", path_str], check=True)


async def _open_path_via_os(raw_path: str) -> OpenFileResponse:
    if not raw_path:
        raise HTTPException(status_code=400, detail="File path is required")

    normalized = _normalize_filepath(raw_path)
    target_path = Path(normalized)

    if target_path.is_dir():
        target_type = "directory"
    elif target_path.is_file():
        target_type = "file"
    else:
        raise HTTPException(status_code=404, detail="File or directory not found")

    try:
        await asyncio.to_thread(_launch_with_system, str(target_path))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File or directory not found")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to open {target_type}: {exc}")

    return OpenFileResponse(
        success=True,
        targetType=target_type,
        resolvedPath=str(target_path),
        message=f"Opened {target_type} via system handler."
    )


def _strip_cmd_prefix(raw_command: str) -> str:
    if raw_command is None:
        return ""

    trimmed = raw_command.strip()
    if not trimmed:
        return ""

    lower = trimmed.lower()
    if lower == "cmd":
        return ""

    if lower.startswith("cmd"):
        remainder = trimmed[3:]
        if not remainder:
            return ""
        if remainder[0].isspace():
            return remainder.lstrip()

    return trimmed


def _normalize_command_for_platform(command: str) -> str:
    if not command:
        return ""

    normalized = command.replace("\uFF02", '"')  # Full-width double quote to ASCII

    if sys.platform.startswith("win"):
        normalized = normalized.replace("¥", "\\").replace("￥", "\\")

    return normalized


def _spawn_system_command(command: str, cwd: Optional[str] = None) -> subprocess.Popen:
    if sys.platform.startswith("win"):
        creationflags = 0
        if hasattr(subprocess, "CREATE_NEW_CONSOLE"):
            creationflags |= subprocess.CREATE_NEW_CONSOLE

        return subprocess.Popen(
            command,
            shell=True,
            cwd=cwd,
            creationflags=creationflags,
        )

    shell_executable = os.environ.get("SHELL")

    if sys.platform == "darwin":
        shell_executable = shell_executable or "/bin/zsh"
    else:
        shell_executable = shell_executable or "/bin/bash"

    return subprocess.Popen(
        command,
        shell=True,
        executable=shell_executable,
        cwd=cwd,
        start_new_session=True,
    )


@app.post("/api/open-file", response_model=OpenFileResponse)
async def open_file_post(request: OpenFileRequest):
    return await _open_path_via_os(request.filepath)


@app.get("/api/open-file")
async def open_file_get(filepath: str):
    import urllib.parse

    decoded_filepath = urllib.parse.unquote_plus(filepath)
    try:
        result = await _open_path_via_os(decoded_filepath)
    except HTTPException as exc:
        message = exc.detail if isinstance(exc.detail, str) else "Failed to open path"
        escaped_message = escape(message)
        error_html = f"""<!DOCTYPE html>
<html lang=\"ja\">
  <head>
    <meta charset=\"utf-8\" />
    <title>Open File Error</title>
  </head>
  <body>
    <p>{escaped_message}</p>
  </body>
</html>"""
        return HTMLResponse(content=error_html, status_code=exc.status_code)

    escaped_message = escape(result.message or 'Opened path via system handler.')
    auto_close_html = f"""<!DOCTYPE html>
<html lang=\"ja\">
  <head>
    <meta charset=\"utf-8\" />
    <title>Open File</title>
    <script>
      window.addEventListener('DOMContentLoaded', () => {{
        setTimeout(() => {{
          window.close();
        }}, 50);
      }});
    </script>
  </head>
  <body>
    <p>{escaped_message}</p>
  </body>
</html>"""
    return HTMLResponse(content=auto_close_html, status_code=200)


@app.get("/api/open-url")
async def open_url(url: str):
    """
    URLスキームをシステムのデフォルトハンドラーで開く
    obsidian:// などのカスタムURLスキームに対応
    """
    try:
        import urllib.parse
        decoded_url = urllib.parse.unquote_plus(url)

        # URLスキームの検証（基本的なチェック）
        if not decoded_url or ':' not in decoded_url:
            raise HTTPException(status_code=400, detail="Invalid URL format")

        # システムのデフォルトハンドラーでURLを開く
        await asyncio.to_thread(_launch_with_system, decoded_url)

        return {
            "success": True,
            "url": decoded_url,
            "message": f"Opened URL with system handler"
        }
    except Exception as e:
        print(f"Error opening URL: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to open URL: {str(e)}")


@app.post("/api/run-command", response_model=RunCommandResponse)
async def run_command(request: RunCommandRequest):
    # まずHTMLエンティティをデコード（例: &quot; → "）
    raw_command = unescape(request.command)
    cleaned_command = _strip_cmd_prefix(raw_command)
    cleaned_command = _normalize_command_for_platform(cleaned_command)
    # print(f"[DEBUG] Running command: {cleaned_command}")
    print("[DEBUG] request:", repr(request))

    if not cleaned_command:
        raise HTTPException(status_code=400, detail="Command is empty or missing after removing prefix")

    working_directory: Optional[str] = None
    if request.working_directory:
        normalized_workdir = _normalize_filepath(request.working_directory)
        if sys.platform.startswith("win"):
            normalized_workdir = normalized_workdir.replace("¥", "\\").replace("￥", "\\")

        if normalized_workdir and not Path(normalized_workdir).exists():
            raise HTTPException(status_code=400, detail="Specified working directory does not exist")

        working_directory = normalized_workdir or None

    try:
        process = _spawn_system_command(cleaned_command, cwd=working_directory)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Failed to locate command: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to execute command: {exc}")

    return RunCommandResponse(success=True, command=cleaned_command, pid=process.pid)


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

        is_obsidian = False
        original_md_content = None
        image_files_map = {}  # file_id -> filename のマッピング

        # Obsidian連携: パス判定と保存パス変更
        if is_obsidian_path(str(file_path)):
            is_obsidian = True
             # .excalidraw リクエストだが、保存先を .excalidraw.md に変更（自動移行）
            if file_path.suffix == '.excalidraw':
                file_path = file_path.with_suffix('.excalidraw.md')

            # 画像を外部ファイルとして保存
            files = data_to_save.get('files', {})
            if files:
                # Excalidraw ファイルと同じディレクトリに画像を保存
                import base64
                for file_id, file_data in files.items():
                    if 'dataURL' in file_data:
                        # dataURL から画像データを抽出
                        data_url = file_data['dataURL']
                        # data:image/png;base64,... の形式
                        if data_url.startswith('data:'):
                            mime_type = file_data.get('mimeType', 'image/png')
                            # 拡張子を取得
                            ext = mime_type.split('/')[-1] if '/' in mime_type else 'png'

                            # base64部分を抽出
                            base64_data = data_url.split(',', 1)[1] if ',' in data_url else data_url

                            # ファイル名を生成（file_idの最初の8文字を使用）
                            image_filename = f"{file_id[:8]}.{ext}"
                            image_path = file_path.parent / image_filename

                            # 画像ファイルを保存
                            try:
                                image_bytes = base64.b64decode(base64_data)
                                with open(image_path, 'wb') as img_file:
                                    img_file.write(image_bytes)

                                # ファイル名をマッピングに追加
                                image_files_map[file_id] = image_filename

                                # dataURLを削除してファイルサイズを削減
                                # Obsidianプラグインは元のdataURLも保持するが、
                                # ここでは削除してファイルサイズを削減
                                del file_data['dataURL']

                                print(f"Saved image: {image_path}")
                            except Exception as e:
                                print(f"Warning: Failed to save image {image_filename}: {e}")

            # 既存コンテンツの読み込み（Frontmatter維持のため）
            if file_path.exists():
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        original_md_content = f.read()
                except Exception as e:
                    print(f"Warning: Failed to read existing obsidian file: {e}")

        # バックアップを作成（Obsidianファイル以外）
        if not is_obsidian:
            backup_success = create_backup(request.filepath, force=request.force_backup)
            if not backup_success:
                print("Warning: Backup creation failed, but continuing with file save")

        # ファイルに保存 (リトライ処理付き)
        max_retries = 10
        retry_delay = 0.2  # 200ミリ秒
        for attempt in range(max_retries):
            try:
                with open(file_path, 'w', encoding='utf-8') as f:
                    if is_obsidian:
                        # Obsidian形式 (Markdown + Compressed JSON) で保存
                        json_str = json.dumps(data_to_save, ensure_ascii=False)
                        new_content = embed_json_into_markdown(
                            original_md_content,
                            json_str,
                            image_files_map if image_files_map else None
                        )
                        f.write(new_content)
                    else:
                        # 通常のJSON保存
                        json.dump(data_to_save, f, ensure_ascii=False, indent=2)
                # 成功したらループを抜ける
                break
            except PermissionError:
                if attempt < max_retries - 1:
                    # print(f"Warning: PermissionError on save (attempt {attempt + 1}/{max_retries}). Retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                else:
                    # 最後のリトライでも失敗したらエラーを投げる
                    # print(f"Error: Failed to save file after {max_retries} attempts due to PermissionError.")
                    raise HTTPException(status_code=500, detail="Failed to save file due to a persistent file lock.")

        data_hash = compute_data_hash(data_to_save)

        return {
            "success": True,
            "message": f"File saved to {request.filepath}",
            "modified": 0,
            "hash": data_hash,
        }
    
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
                "path": compute_relative_path(current_path, str(file_path)),
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
            folderPath=compute_relative_path(current_path, str(shortcut_path))
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
            savedPath=compute_relative_path(request.currentPath, str(email_path))
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
