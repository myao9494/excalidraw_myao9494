/**
 * Vite設定ファイル
 * Excalidrawの手書き風フォントをオフラインで使用するため、
 * フォントファイルを静的アセットとしてビルドに含める設定を追加
 */
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3001,
    host: "0.0.0.0",  // Tailscale VPN対応
    // open the browser
    open: true,
  },
  publicDir: "public",
  optimizeDeps: {
    esbuildOptions: {
      // Bumping to 2022 due to "Arbitrary module namespace identifier names" not being
      // supported in Vite's default browser target https://github.com/vitejs/vite/issues/13556
      target: "es2022",
      treeShaking: true,
    },
  },
  build: {
    rollupOptions: {
      output: {
        // アセットファイルの命名規則を維持
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.woff2')) {
            return 'fonts/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    },
    // 大きなアセットファイルの警告を抑制
    chunkSizeWarningLimit: 3000
  },
  // フォントファイルをアセットとして認識させる
  assetsInclude: ['**/*.woff2', '**/*.woff', '**/*.ttf'],
  // root を明示的に設定
  root: "."
});
