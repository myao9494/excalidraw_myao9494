# 🧭 Debug Guide — Excalidraw_Myao9494

> React + FastAPI + Local File I/O  
> 保存・ハッシュ・非同期処理の整合性を安全に検証するための包括的デバッグ手法

---

## 🧩 目的

本ドキュメントは、Excalidraw_Myao9494 プロジェクトにおける  
**保存処理・ハッシュ整合性・非同期動作** の不具合を再現・特定するための  
推奨デバッグ手法をまとめたものです。  

特に、過去に発生した以下のような不具合を再現・防止することを目的とします：

> 保存処理中にハッシュ確認が実行され、  
> フロントエンド側のハッシュとサーバー保存後のハッシュが異なり  
> 無限ループが発生した問題。

---

## ⚙️ 全体構成と観測ポイント

| 層 | デバッグ手法 | 目的 |
|----|---------------|------|
| 🧠 フロントエンド (React/Vite) | Chrome DevTools / VSCode Debug / React DevTools | イベント・state・レンダリングの追跡 |
| ⚙️ バックエンド (FastAPI) | VSCode Python Debug / loguru / middleware logging | ファイルI/Oとハッシュ計算の監視 |
| 🔗 通信層 (API) | Networkタブ / Postman / Axios interceptor | リクエスト／レスポンス整合性の検証 |

---

## 🧠 フロントエンド側デバッグ

### 1️⃣ Chrome DevTools

#### Network タブ
- `POST /api/save-file` が**連続で発火**していないか  
- Response の `hash` 値がサーバーで再計算されたものと一致しているか  
- Timing タブでリクエスト間隔を確認

#### Performance タブ
- 「ボタン押下 → 保存完了」のシーケンスを可視化
- 保存・検証が並行して発生していないかをタイムラインで観測

---

### 2️⃣ VSCode ブレークポイントデバッグ (Vite)

`.vscode/launch.json` に以下を追加：

```json
{
  "type": "chrome",
  "request": "launch",
  "name": "Debug React (Vite)",
  "url": "http://localhost:5173",
  "webRoot": "${workspaceFolder}/src"
}
```

`handleSave()` / `checkHash()` にブレークポイントを設定し、  
**保存完了前にハッシュ比較が走っていないか**をステップ実行で確認します。

---

### 3️⃣ React Developer Tools

- 保存処理中の state 遷移を確認  
  例: `idle → saving → verifying → idle`  
- `isSaving` / `saveState` / `lastSavedHash` の変化を追跡  

---

### 4️⃣ Axios Interceptor ログ

API 通信ログを統一出力することで、時系列解析が容易になります。

```ts
axios.interceptors.request.use((config) => {
  console.debug("[API Request]", config.method, config.url, config.data);
  return config;
});

axios.interceptors.response.use((res) => {
  console.debug("[API Response]", res.status, res.data);
  return res;
});
```

---

## ⚙️ バックエンド側デバッグ（FastAPI）

### 1️⃣ VSCode Python Debug 設定

```json
{
  "name": "FastAPI Debug",
  "type": "python",
  "request": "launch",
  "program": "uvicorn",
  "args": ["backend.main:app", "--reload", "--port", "8000"],
  "jinja": true,
  "console": "integratedTerminal"
}
```

`save_file()` 内でハッシュ計算をステップ実行し、  
**クライアント送信ハッシュとの整合性**を確認します。

---

### 2️⃣ loguru / middleware ログ設定

```python
from loguru import logger
import hashlib
from fastapi import FastAPI, Request

app = FastAPI()

@app.middleware("http")
async def log_request(request: Request, call_next):
    logger.info(f"--> {request.method} {request.url}")
    body = await request.body()
    logger.debug(f"Request body: {body[:200]}")
    response = await call_next(request)
    logger.info(f"<-- {response.status_code} {request.method} {request.url}")
    return response

@app.post("/api/save-file")
async def save_file(data: dict):
    content = data["content"].encode("utf-8")
    hash_client = data["hash"]
    hash_server = hashlib.sha256(content).hexdigest()
    logger.debug(f"[SAVE] client={hash_client} server={hash_server}")
    return {"hash": hash_server}
```

→ リクエスト単位でログをトレースできるようになります。

---

### 3️⃣ 非同期I/O検証

`asyncio.sleep()` で遅延を挿入し、  
**保存と検証のタイミング競合**を人工的に再現できます。

```python
import asyncio
import hashlib

@app.post("/api/save-file")
async def save_file(data: dict):
    await asyncio.sleep(0.1)  # 人為的な遅延でレース再現
    content = data["content"].encode("utf-8")
    hash_server = hashlib.sha256(content).hexdigest()
    return {"hash": hash_server}
```

---

## 🔗 API層でのテスト

| ツール | 目的 | 実施方法 |
|--------|------|-----------|
| 🧰 Postman | 保存API単体テスト | 同一リクエストを連投してレース再現 |
| 💻 VSCode REST Client | `.http` ファイルから即実行 | コードレビューと併用可能 |
| 🧪 httpx + pytest | 自動テスト化 | 正常系・異常系でハッシュ整合性を検証 |

---

## 🧮 検証テンプレート

```text
📋 Debug Scenario: 保存処理タイミング検証

1️⃣ 初期状態:
    isSaving: false
    lastSavedHash: <前回のhash>

2️⃣ 操作:
    保存ボタン押下 or 自動保存発火

3️⃣ 期待結果:
    - /api/save-file が1回だけ発火
    - server hash == client hash
    - state: "saving" → "idle"

4️⃣ 実際結果:
    [ ] 連続リクエスト
    [ ] ハッシュ不一致
    [ ] state戻らずループ発生
```

---

## 🧭 推奨ツールまとめ

| カテゴリ | 推奨ツール | 主な目的 |
|-----------|-------------|-----------|
| 🎨 フロント | Chrome DevTools / React DevTools | state・レンダリング追跡 |
| 🧠 コード | VSCode Debugger | ブレークポイント実行 |
| 🪵 ログ | loguru / axios interceptor | リクエスト整合性確認 |
| 🔬 テスト | Postman / httpx / pytest | 保存API再現検証 |
| 📈 トレース | OpenTelemetry（任意） | 保存～レスポンス間の遅延解析 |

---

## ✅ 結論

ハッシュ不一致や無限保存ループのようなタイミング依存バグは、  
**「時間軸で観察する」**ことが最も有効です。

> - フロントの Network/Console  
> - バックエンドのログ出力  
> - 状態変化の観測  

これらを**同一タイムライン上で突き合わせる**ことで、  
原因は必ず明確になります。

---

**更新履歴**  
- v1.0 — 初版（保存同期・ハッシュ検証デバッグ戦略追加）  
- v1.1 — Axios・Loguru導入手順追記（2025/10）
