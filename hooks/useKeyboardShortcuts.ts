import { useEffect } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useMousePosition } from './useMousePosition';
import { createDefaultStickyNote, createLinkStickyNote } from '../utils/stickyNoteUtils';

/**
 * キーボードショートカット機能のオプション
 */
export interface KeyboardShortcutsOptions {
  /** ExcalidrawのAPIインスタンス */
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  /** ビューポート座標をシーン座標に変換する関数 */
  viewportCoordsToSceneCoords: (coords: { clientX: number; clientY: number }, appState: any) => { x: number; y: number };
  /** 保存ショートカット用のコールバック関数 */
  onSave?: () => void;
}

/**
 * カスタムキーボードショートカット機能を提供するフック
 * 
 * 以下の機能を提供：
 * - C: 矢印なしの直線描画
 * - N: 基本付箋作成
 * - W: クリップボードからリンク付箋作成
 * - Tab: 選択されたオブジェクトの形状を順番に変更（四角形 → ひし形 → 円 → ...）
 * - Cmd/Ctrl + M: 選択要素を最前面に移動
 * - Cmd/Ctrl + B: 選択要素を最背面に移動
 * 
 * @param options - キーボードショートカットのオプション
 */
export const useKeyboardShortcuts = ({ excalidrawAPI, viewportCoordsToSceneCoords, onSave }: KeyboardShortcutsOptions) => {
  const mousePosition = useMousePosition();

  useEffect(() => {
    if (!excalidrawAPI) return;

    /**
     * キーボードイベントハンドラー
     * @param event - KeyboardEventオブジェクト
     */
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      // 入力フィールドにフォーカスがある場合は処理をスキップ
      const isInputFocused = target.matches('input, textarea, [contenteditable]');

      if (isInputFocused) return;

      const key = event.key.toLowerCase();
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;

      // Cmd/Ctrl + S: 保存
      if (isCtrlOrCmd && key === 's') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (onSave) {
          onSave();
        }
        return;
      }

      // Cmd/Ctrl + M: 最前面に移動
      if (isCtrlOrCmd && key === 'm') {
        event.preventDefault();
        handleMoveToFront();
        return;
      }

      // Cmd/Ctrl + B: 最背面に移動
      if (isCtrlOrCmd && key === 'b') {
        event.preventDefault();
        handleMoveToBack();
        return;
      }

      // 他のCtrl/Cmdキーの組み合わせは処理をスキップ
      if (isCtrlOrCmd) return;

      switch (key) {
        case 'c':
          event.preventDefault();
          handleArrowlesLine();
          break;
        case 'n':
          event.preventDefault();
          handleCreateStickyNote();
          break;
        case 'w':
          event.preventDefault();
          handleCreateClipboardStickyNote();
          break;
        case 'tab':
          event.preventDefault();
          handleShapeTransform();
          break;
      }
    };

    /**
     * Cキー: 矢印なしの直線描画機能
     * 
     * 矢印ツールを選択し、要素作成後に矢印ヘッドを無効化することで
     * 矢印なしの直線を描画可能にする。
     */
    const handleArrowlesLine = () => {
      try {
        const currentElementsCount = excalidrawAPI.getSceneElements().length;

        // 矢印ツールを選択
        excalidrawAPI.setActiveTool({
          type: 'arrow',
          customType: null,
          locked: false,
          strokeColor: '#000000',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 1,
          roughness: 0
        });

        /**
         * 新しい要素が作成されたかチェックし、矢印ヘッドを無効化
         */
        const checkNewElement = () => {
          const elements = excalidrawAPI.getSceneElements();
          if (elements.length > currentElementsCount) {
            const newElement = elements[elements.length - 1];
            if (newElement.type === 'arrow') {
              // 矢印ヘッドを無効化
              (newElement as any).startArrowhead = null;
              (newElement as any).endArrowhead = null;
              
              excalidrawAPI.updateScene({
                elements: elements
              });
            }
            document.removeEventListener('pointerup', checkNewElement);
          }
        };

        // ポインターアップイベントで新要素をチェック
        document.addEventListener('pointerup', checkNewElement);
      } catch (error) {
        console.error('線ツールの設定に失敗しました:', error);
      }
    };

    /**
     * Nキー: 基本付箋作成機能
     * 
     * 現在のマウス位置に黄色の基本付箋を作成し、
     * 作成後にテキスト要素を選択状態にする。
     */
    const handleCreateStickyNote = () => {
      try {
        const appState = excalidrawAPI.getAppState();
        // マウス位置をシーン座標に変換
        const sceneCoords = viewportCoordsToSceneCoords(
          { clientX: mousePosition.x, clientY: mousePosition.y },
          appState
        );

        // 基本付箋を作成
        const stickyNoteElements = createDefaultStickyNote(sceneCoords.x, sceneCoords.y);
        const textElement = stickyNoteElements[1];

        // シーンを更新し、テキスト要素を選択状態に
        excalidrawAPI.updateScene({
          elements: [...excalidrawAPI.getSceneElements(), ...stickyNoteElements],
          appState: {
            ...appState,
            selectedElementIds: { [textElement.id]: true }
          }
        });
      } catch (error) {
        console.error('付箋の作成に失敗しました:', error);
      }
    };

    /**
     * Wキー: クリップボードからリンク付箋作成機能
     * 
     * クリップボードの内容を取得し、ファイルパスやURLの場合は
     * 適切なリンクテキストを生成してリンク付箋を作成する。
     */
    const handleCreateClipboardStickyNote = async () => {
      try {
        const clipboardText = await navigator.clipboard.readText();
        if (!clipboardText) return;

        const appState = excalidrawAPI.getAppState();
        // マウス位置をシーン座標に変換
        const sceneCoords = viewportCoordsToSceneCoords(
          { clientX: mousePosition.x, clientY: mousePosition.y },
          appState
        );

        let linkText = clipboardText;
        // ファイル名を表示テキストとして抽出
        let displayText = decodeURIComponent(clipboardText.split(/[\/\\]/).pop() || clipboardText);

        // ファイル種別に応じてコマンドプレフィックスを追加
        if (clipboardText.toLowerCase().endsWith('.py')) {
          linkText = `cmd python ${clipboardText}`;
        } else if (clipboardText.toLowerCase().endsWith('.sh') || clipboardText.toLowerCase().endsWith('.bat')) {
          linkText = `cmd ${clipboardText}`;
        }

        // リンク付箋を作成
        const stickyNoteElements = createLinkStickyNote(sceneCoords.x, sceneCoords.y, displayText, linkText);
        const textElement = stickyNoteElements[1];

        // シーンを更新し、テキスト要素を選択状態に
        excalidrawAPI.updateScene({
          elements: [...excalidrawAPI.getSceneElements(), ...stickyNoteElements],
          appState: {
            ...appState,
            selectedElementIds: { [textElement.id]: true }
          }
        });
      } catch (error) {
        console.error('クリップボード付箋の作成に失敗しました:', error);
      }
    };

    /**
     * Tabキー: 選択されたオブジェクトの形状変更機能
     * 
     * 選択されたオブジェクトの形状を順番に変更する。
     * 変更順序: 四角形 → ひし形 → 円 → 四角形（ループ）
     * 選択されたオブジェクトがない場合は何もしない。
     */
    const handleShapeTransform = () => {
      try {
        const allElements = excalidrawAPI.getSceneElements();
        const selectedElementIds = excalidrawAPI.getAppState().selectedElementIds;
        
        // 選択された要素を取得
        const selectedElements = allElements.filter(element => 
          selectedElementIds[element.id]
        );

        if (selectedElements.length === 0) return;

        // 形状変更可能な要素のタイプ定義
        const shapeTypes = ['rectangle', 'diamond', 'ellipse'];
        
        // 更新された要素を格納する配列
        const updatedElements = allElements.map(element => {
          // 選択されている要素で、かつ形状変更可能な場合のみ処理
          if (selectedElementIds[element.id] && shapeTypes.includes(element.type)) {
            const currentIndex = shapeTypes.indexOf(element.type);
            const nextIndex = (currentIndex + 1) % shapeTypes.length;
            const nextType = shapeTypes[nextIndex];
            
            return {
              ...element,
              type: nextType as any
            };
          }
          return element;
        });

        // シーンを更新
        excalidrawAPI.updateScene({
          elements: updatedElements,
          appState: {
            ...excalidrawAPI.getAppState(),
            selectedElementIds: selectedElementIds
          }
        });
      } catch (error) {
        console.error('形状変更に失敗しました:', error);
      }
    };

    /**
     * Cmd/Ctrl + M: 選択要素を最前面に移動
     * 
     * 選択された要素とその関連するテキスト要素を特定し、
     * 要素配列の末尾に移動して最前面に表示する。
     */
    const handleMoveToFront = () => {
      try {
        const allElements = excalidrawAPI.getSceneElements();
        const selectedElementIds = excalidrawAPI.getAppState().selectedElementIds;

        // 選択された要素を取得
        let selectedElements = allElements.filter(element => 
          selectedElementIds[element.id]
        );

        // 選択された要素に紐づくテキスト要素のIDを収集
        const boundElementIds = new Set();
        selectedElements.forEach(element => {
          if (element.boundElements) {
            element.boundElements.forEach(bound => {
              boundElementIds.add(bound.id);
            });
          }
        });

        // 選択された要素と紐づくテキスト要素を結合
        selectedElements = [
          ...selectedElements,
          ...allElements.filter(element => boundElementIds.has(element.id))
        ];

        if (selectedElements.length === 0) return;

        // 選択されていない要素を取得
        const nonSelectedElements = allElements.filter(
          element => !selectedElements.some(selected => selected.id === element.id)
        );

        // 選択された要素を配列の末尾に配置（最前面）
        const newElements = [...nonSelectedElements, ...selectedElements];

        excalidrawAPI.updateScene({
          elements: newElements,
          appState: {
            ...excalidrawAPI.getAppState(),
            selectedElementIds: selectedElementIds
          }
        });
      } catch (error) {
        console.error('最前面移動に失敗しました:', error);
      }
    };

    /**
     * Cmd/Ctrl + B: 選択要素を最背面に移動
     * 
     * 選択された要素とその関連するテキスト要素を特定し、
     * 要素配列の先頭に移動して最背面に表示する。
     */
    const handleMoveToBack = () => {
      try {
        const allElements = excalidrawAPI.getSceneElements();
        const selectedElementIds = excalidrawAPI.getAppState().selectedElementIds;

        // 選択された要素を取得
        let selectedElements = allElements.filter(element => 
          selectedElementIds[element.id]
        );

        // 選択された要素に紐づくテキスト要素のIDを収集
        const boundElementIds = new Set();
        selectedElements.forEach(element => {
          if (element.boundElements) {
            element.boundElements.forEach(bound => {
              boundElementIds.add(bound.id);
            });
          }
        });

        // 選択された要素と紐づくテキスト要素を結合
        selectedElements = [
          ...selectedElements,
          ...allElements.filter(element => boundElementIds.has(element.id))
        ];

        if (selectedElements.length === 0) return;

        // 選択されていない要素を取得
        const nonSelectedElements = allElements.filter(
          element => !selectedElements.some(selected => selected.id === element.id)
        );

        // 選択された要素を配列の先頭に配置（最背面）
        const newElements = [...selectedElements, ...nonSelectedElements];

        excalidrawAPI.updateScene({
          elements: newElements,
          appState: {
            ...excalidrawAPI.getAppState(),
            selectedElementIds: selectedElementIds
          }
        });
      } catch (error) {
        console.error('最背面移動に失敗しました:', error);
      }
    };

    // キーボードイベントリスナーを登録（キャプチャフェーズで実行）
    document.addEventListener('keydown', handleKeyDown, true);

    // クリーンアップ関数：コンポーネントがアンマウントされる際にイベントリスナーを削除
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [excalidrawAPI, mousePosition, viewportCoordsToSceneCoords, onSave]);
};