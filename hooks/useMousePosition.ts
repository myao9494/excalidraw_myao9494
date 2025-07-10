import { useState, useEffect } from 'react';

/**
 * マウス位置を表すインターフェース
 */
export interface MousePosition {
  /** マウスのX座標（クライアント座標系） */
  x: number;
  /** マウスのY座標（クライアント座標系） */
  y: number;
}

/**
 * マウス位置を追跡するカスタムフック
 * 
 * グローバルなマウス移動イベントを監視し、リアルタイムでマウス位置を更新する。
 * キーボードショートカットで付箋を作成する際に、マウス位置を基準として
 * 要素を配置するために使用される。
 * 
 * @returns {MousePosition} 現在のマウス位置（クライアント座標系）
 * 
 * @example
 * ```tsx
 * const mousePosition = useMousePosition();
 * console.log(`Mouse at: ${mousePosition.x}, ${mousePosition.y}`);
 * ```
 */
export const useMousePosition = (): MousePosition => {
  // マウス位置の状態を管理
  const [mousePosition, setMousePosition] = useState<MousePosition>({
    x: 0,
    y: 0
  });

  useEffect(() => {
    /**
     * マウス移動イベントハンドラー
     * @param event - MouseEventオブジェクト
     */
    const handleMouseMove = (event: MouseEvent) => {
      setMousePosition({
        x: event.clientX, // ビューポート左端からのX座標
        y: event.clientY  // ビューポート上端からのY座標
      });
    };

    // ドキュメント全体のマウス移動イベントを監視
    document.addEventListener('mousemove', handleMouseMove);

    // クリーンアップ関数：コンポーネントがアンマウントされる際にイベントリスナーを削除
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return mousePosition;
};