"""
Obsidian互換機能のテスト

このテストでは以下を確認する：
1. is_obsidian_path関数のパス判定
2. JSONの圧縮・解凍
3. MarkdownからのJSON抽出
4. MarkdownへのJSON埋め込み
"""
import sys
import json
from pathlib import Path

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.main import (
    is_obsidian_path,
    extract_json_from_markdown,
    embed_json_into_markdown,
)
from lzstring import LZString


def test_is_obsidian_path():
    """パス判定のテスト"""
    print("Testing is_obsidian_path...")

    # Obsidianパスとして認識されるべきもの
    assert is_obsidian_path("/vault/obsidian/test.excalidraw.md") == True
    assert is_obsidian_path("/vault/Obsidian/test.excalidraw.md") == True
    assert is_obsidian_path("/vault/obsidian/test.excalidraw") == True

    # Obsidianパスとして認識されないもの
    assert is_obsidian_path("/vault/test.excalidraw.md") == False
    assert is_obsidian_path("/vault/test.excalidraw") == False
    assert is_obsidian_path("/vault/obsidian/test.json") == False

    print("✅ is_obsidian_path test passed")


def test_compression_decompression():
    """圧縮・解凍のテスト"""
    print("\nTesting compression/decompression...")

    lz = LZString()

    # テストデータ
    test_data = {
        "type": "excalidraw",
        "version": 2,
        "source": "https://excalidraw.com",
        "elements": [
            {
                "type": "rectangle",
                "x": 100,
                "y": 100,
                "width": 200,
                "height": 150
            }
        ],
        "appState": {},
        "files": {}
    }

    json_str = json.dumps(test_data, ensure_ascii=False)

    # 圧縮
    compressed = lz.compressToBase64(json_str)
    assert compressed is not None
    assert len(compressed) > 0
    print(f"  Original size: {len(json_str)} bytes")
    print(f"  Compressed size: {len(compressed)} bytes")
    print(f"  Compression ratio: {len(compressed)/len(json_str)*100:.1f}%")

    # 解凍
    decompressed = lz.decompressFromBase64(compressed)
    assert decompressed is not None
    assert decompressed == json_str

    # 解凍したデータがJSONとしてパースできるか
    parsed = json.loads(decompressed)
    assert parsed == test_data

    print("✅ Compression/decompression test passed")


def test_extract_json_from_markdown():
    """MarkdownからJSON抽出のテスト"""
    print("\nTesting extract_json_from_markdown...")

    # テストケース1: 非圧縮JSON
    test_data = {"type": "excalidraw", "version": 2, "elements": []}
    json_str = json.dumps(test_data, ensure_ascii=False)

    markdown_content = f"""---
tags: [excalidraw]
excalidraw-plugin: parsed
---

# Text Elements

# Drawing
```compressed-json
{json_str}
```"""

    extracted = extract_json_from_markdown(markdown_content)
    assert json.loads(extracted) == test_data
    print("  ✓ Non-compressed JSON extraction passed")

    # テストケース2: 圧縮JSON
    lz = LZString()
    compressed = lz.compressToBase64(json_str)

    markdown_compressed = f"""---
tags: [excalidraw]
excalidraw-plugin: parsed
---

# Text Elements

# Drawing
```compressed-json
{compressed}
```"""

    extracted_compressed = extract_json_from_markdown(markdown_compressed)
    assert json.loads(extracted_compressed) == test_data
    print("  ✓ Compressed JSON extraction passed")

    print("✅ extract_json_from_markdown test passed")


def test_embed_json_into_markdown():
    """MarkdownへのJSON埋め込みのテスト"""
    print("\nTesting embed_json_into_markdown...")

    test_data = {"type": "excalidraw", "version": 2, "elements": []}
    json_str = json.dumps(test_data, ensure_ascii=False)

    # テストケース1: 新規作成
    result = embed_json_into_markdown(None, json_str)
    assert "```compressed-json" in result
    assert "tags: [excalidraw]" in result
    assert "excalidraw-plugin: parsed" in result

    # JSONブロックを抽出して解凍できるか確認
    extracted = extract_json_from_markdown(result)
    assert json.loads(extracted) == test_data
    print("  ✓ New markdown creation passed")

    # テストケース2: 既存コンテンツの更新
    existing_content = """---
tags: [excalidraw, custom]
excalidraw-plugin: parsed
custom-field: value
---

# Text Elements
- Custom text

# Drawing
```compressed-json
OLD_DATA
```

# Additional Notes
Some custom notes"""

    updated_data = {"type": "excalidraw", "version": 2, "elements": [{"id": "new"}]}
    updated_json_str = json.dumps(updated_data, ensure_ascii=False)

    result_updated = embed_json_into_markdown(existing_content, updated_json_str)

    # カスタムフィールドが維持されているか確認
    assert "custom-field: value" in result_updated
    assert "Custom text" in result_updated
    assert "Additional Notes" in result_updated
    assert "Some custom notes" in result_updated

    # 更新されたJSONが抽出できるか確認
    extracted_updated = extract_json_from_markdown(result_updated)
    assert json.loads(extracted_updated) == updated_data
    print("  ✓ Existing markdown update passed")

    print("✅ embed_json_into_markdown test passed")


def test_end_to_end():
    """エンドツーエンドのテスト"""
    print("\nTesting end-to-end workflow...")

    # テストデータ
    original_data = {
        "type": "excalidraw",
        "version": 2,
        "source": "https://excalidraw.com",
        "elements": [
            {
                "type": "rectangle",
                "id": "rect1",
                "x": 100,
                "y": 100,
                "width": 200,
                "height": 150
            }
        ],
        "appState": {"viewBackgroundColor": "#ffffff"},
        "files": {}
    }

    json_str = json.dumps(original_data, ensure_ascii=False)

    # ステップ1: Markdown作成
    markdown = embed_json_into_markdown(None, json_str)
    print("  ✓ Step 1: Created markdown")

    # ステップ2: JSON抽出
    extracted_json = extract_json_from_markdown(markdown)
    print("  ✓ Step 2: Extracted JSON")

    # ステップ3: データ検証
    extracted_data = json.loads(extracted_json)
    assert extracted_data == original_data
    print("  ✓ Step 3: Data verified")

    # ステップ4: データ更新
    updated_data = original_data.copy()
    updated_data["elements"].append({
        "type": "ellipse",
        "id": "ellipse1",
        "x": 300,
        "y": 300,
        "width": 100,
        "height": 100
    })
    updated_json_str = json.dumps(updated_data, ensure_ascii=False)

    # ステップ5: Markdown更新
    updated_markdown = embed_json_into_markdown(markdown, updated_json_str)
    print("  ✓ Step 4: Updated markdown")

    # ステップ6: 更新データ検証
    final_extracted = extract_json_from_markdown(updated_markdown)
    final_data = json.loads(final_extracted)
    assert final_data == updated_data
    assert len(final_data["elements"]) == 2
    print("  ✓ Step 5: Updated data verified")

    print("✅ End-to-end test passed")


if __name__ == "__main__":
    print("=" * 60)
    print("Obsidian Integration Tests")
    print("=" * 60)

    try:
        test_is_obsidian_path()
        test_compression_decompression()
        test_extract_json_from_markdown()
        test_embed_json_into_markdown()
        test_end_to_end()

        print("\n" + "=" * 60)
        print("🎉 All tests passed!")
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
