"""
API統合テスト

実際のAPIエンドポイントを使用して、Obsidian互換機能をテストする。
このテストを実行する前に、バックエンドサーバーが起動している必要があります。
"""
import sys
import json
import requests
from pathlib import Path

# テスト用の設定
API_BASE_URL = "http://localhost:8008"
TEST_FILE_PATH = str(Path(__file__).parent / "obsidian_test" / "test.excalidraw.md")


def test_load_obsidian_file():
    """Obsidianファイルの読み込みテスト"""
    print("\nTesting load Obsidian file...")

    response = requests.get(
        f"{API_BASE_URL}/api/load-file",
        params={"filepath": TEST_FILE_PATH}
    )

    assert response.status_code == 200, f"Expected 200, got {response.status_code}"

    data = response.json()
    assert "data" in data
    assert "hash" in data
    assert data["data"]["type"] == "excalidraw"
    assert len(data["data"]["elements"]) > 0

    print("  ✓ Obsidian file loaded successfully")
    print(f"  ✓ Found {len(data['data']['elements'])} elements")

    return data


def test_save_obsidian_file(original_data):
    """Obsidianファイルの保存テスト"""
    print("\nTesting save Obsidian file...")

    # データを変更
    modified_data = original_data["data"].copy()
    modified_data["elements"].append({
        "type": "ellipse",
        "version": 1,
        "versionNonce": 2,
        "isDeleted": False,
        "id": "test2",
        "fillStyle": "hachure",
        "strokeWidth": 1,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "angle": 0,
        "x": 300,
        "y": 300,
        "strokeColor": "#000000",
        "backgroundColor": "transparent",
        "width": 100,
        "height": 100,
        "seed": 2,
        "groupIds": [],
        "frameId": None,
        "roundness": None,
        "boundElements": None,
        "updated": 1,
        "link": None,
        "locked": False
    })

    # 保存リクエスト
    save_request = {
        "filepath": TEST_FILE_PATH,
        "data": modified_data,
        "force_backup": False
    }

    response = requests.post(
        f"{API_BASE_URL}/api/save-file",
        json=save_request
    )

    assert response.status_code == 200, f"Expected 200, got {response.status_code}"

    result = response.json()
    assert result["success"] == True

    print("  ✓ Obsidian file saved successfully")

    return modified_data


def test_reload_and_verify(expected_data):
    """保存したファイルを再読み込みして検証"""
    print("\nTesting reload and verify...")

    response = requests.get(
        f"{API_BASE_URL}/api/load-file",
        params={"filepath": TEST_FILE_PATH}
    )

    assert response.status_code == 200

    data = response.json()
    assert len(data["data"]["elements"]) == len(expected_data["elements"])

    print("  ✓ Reloaded file successfully")
    print(f"  ✓ Verified {len(data['data']['elements'])} elements")


def test_markdown_structure_preserved():
    """Markdownの構造が保持されているか確認"""
    print("\nTesting markdown structure preservation...")

    # ファイルを直接読み込んで確認
    with open(TEST_FILE_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    assert "tags: [excalidraw]" in content
    assert "excalidraw-plugin: parsed" in content
    assert "# Text Elements" in content
    assert "# Drawing" in content
    assert "```json" in content

    print("  ✓ Markdown structure preserved")


def test_backup_not_created():
    """Obsidianファイルのバックアップが作成されていないことを確認"""
    print("\nTesting backup not created...")

    backup_dir = Path(TEST_FILE_PATH).parent / "backup"

    if backup_dir.exists():
        backup_files = list(backup_dir.glob("test_backup_*"))
        assert len(backup_files) == 0, f"Found {len(backup_files)} backup files (should be 0)"

    print("  ✓ No backup created (as expected for Obsidian files)")


def run_server_check():
    """サーバーが起動しているか確認"""
    try:
        response = requests.get(f"{API_BASE_URL}/", timeout=2)
        return response.status_code == 200
    except:
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("API Integration Tests")
    print("=" * 60)

    # サーバー起動確認
    if not run_server_check():
        print("\n❌ Backend server is not running!")
        print("Please start the server with: python backend/main.py")
        sys.exit(1)

    print("✓ Backend server is running")

    try:
        # テスト実行
        original_data = test_load_obsidian_file()
        modified_data = test_save_obsidian_file(original_data)
        test_reload_and_verify(modified_data)
        test_markdown_structure_preserved()
        test_backup_not_created()

        print("\n" + "=" * 60)
        print("🎉 All API integration tests passed!")
        print("=" * 60)

    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
