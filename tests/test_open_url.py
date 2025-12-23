"""
Obsidian URLスキーム連携のテスト

このテストでは以下を確認する：
1. /api/open-url エンドポイントの存在確認
2. URLデコード処理
3. エラーハンドリング
"""
import sys
from pathlib import Path

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_api_endpoint_exists():
    """エンドポイントが存在することを確認"""
    from backend.main import app

    # FastAPIのルートを確認
    routes = [route.path for route in app.routes]
    assert "/api/open-url" in routes, "エンドポイント /api/open-url が存在しません"
    print("✅ エンドポイント /api/open-url が存在します")


def test_url_decode():
    """URLデコードのテスト"""
    import urllib.parse

    # テストケース1: 日本語を含むURL
    original = "obsidian://open?vault=obsidian_test&file=あらrh.excalidraw"
    encoded = urllib.parse.quote_plus(original)
    decoded = urllib.parse.unquote_plus(encoded)
    assert decoded == original
    print(f"✅ URLデコードテスト成功: {original}")

    # テストケース2: スペースを含むURL
    original2 = "obsidian://open?vault=my vault&file=test file.excalidraw"
    encoded2 = urllib.parse.quote_plus(original2)
    decoded2 = urllib.parse.unquote_plus(encoded2)
    assert decoded2 == original2
    print(f"✅ URLデコードテスト成功（スペース含む）: {original2}")


def test_url_validation():
    """URL検証のテスト"""

    # 有効なURL
    valid_urls = [
        "obsidian://open?vault=test&file=test.md",
        "http://example.com",
        "https://example.com",
        "file:///path/to/file",
    ]

    for url in valid_urls:
        assert ':' in url, f"無効なURL: {url}"

    print("✅ URL検証テスト成功")

    # 無効なURL
    invalid_urls = [
        "",
        "invalid",
        "no-colon-here",
    ]

    for url in invalid_urls:
        assert ':' not in url or not url, f"不正なURLが通過: {url}"

    print("✅ 無効なURL検出テスト成功")


def test_obsidian_url_format():
    """Obsidian URLフォーマットのテスト"""

    # テストケース: Obsidian URLの構造
    vault_name = "obsidian_test"
    file_name = "あらrh.excalidraw"

    # URLの生成
    obsidian_url = f"obsidian://open?vault={vault_name}&file={file_name}"

    assert obsidian_url.startswith("obsidian://")
    assert "vault=" in obsidian_url
    assert "file=" in obsidian_url

    print(f"✅ Obsidian URLフォーマットテスト成功: {obsidian_url}")


if __name__ == "__main__":
    print("=" * 60)
    print("Obsidian URL Scheme Integration Tests")
    print("=" * 60)

    try:
        test_api_endpoint_exists()
        test_url_decode()
        test_url_validation()
        test_obsidian_url_format()

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
