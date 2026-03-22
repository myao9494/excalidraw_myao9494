/**
 * Service Worker: Excalidraw PWA用
 * キャッシュ戦略:
 *   - 静的アセット（JS, CSS, フォント）: キャッシュファースト
 *   - APIリクエスト: ネットワークのみ
 *   - HTMLページ: ネットワークファースト（フォールバックでキャッシュ）
 */

const CACHE_NAME = 'excalidraw-pwa-v2';

// プリキャッシュ対象のURL（インストール時にキャッシュ）
const PRECACHE_URLS = [
    '/',
];

// キャッシュ対象の静的アセットパターン
const STATIC_ASSET_PATTERNS = [
    /\.js$/,
    /\.css$/,
    /\.woff2?$/,
    /\.ttf$/,
    /\.ico$/,
    /\.png$/,
    /\.jpg$/,
    /\.jpeg$/,
    /\.svg$/,
    /\.webp$/,
];

// APIリクエストのパターン
const API_PATTERN = /\/api\//;

// インストールイベント: プリキャッシュを実行
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// アクティベーションイベント: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// フェッチイベント: リクエストの種類に応じてキャッシュ戦略を切り替え
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 同一オリジン以外はスキップ
    if (url.origin !== location.origin) {
        return;
    }

    // APIリクエスト: 毎回バックエンドへ到達させる
    if (API_PATTERN.test(url.pathname)) {
        event.respondWith(networkOnly(request));
        return;
    }

    // 静的アセット: キャッシュファースト
    if (STATIC_ASSET_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // その他（HTMLなど）: ネットワークファースト
    event.respondWith(networkFirst(request));
});

/**
 * キャッシュファースト戦略
 * キャッシュにあればそれを返し、なければネットワークから取得してキャッシュに保存
 */
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok && request.method === 'GET') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        // オフライン時にキャッシュもない場合
        return new Response('オフラインです', { status: 503 });
    }
}

/**
 * ネットワークファースト戦略
 * ネットワークから取得を試み、失敗時にキャッシュから返す
 */
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok && request.method === 'GET') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        return new Response('オフラインです', { status: 503 });
    }
}

/**
 * ネットワークのみ戦略
 * APIはOS連携やローカルファイルI/Oを含むため、キャッシュを介さず常にバックエンドへ送る
 */
async function networkOnly(request) {
    try {
        return await fetch(request);
    } catch (error) {
        return new Response('オフラインです', { status: 503 });
    }
}
