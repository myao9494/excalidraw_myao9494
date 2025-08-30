import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { createStickyNoteElements, createStickyNoteElementsWithFullPath } from "./dragDropUtils";

export interface EmailData {
  subject: string;
  data: string;
  filePath?: string;
}

export interface EmailSaveResponse {
  success: boolean;
  savedPath?: string;
  error?: string;
}

/**
 * メール専用の付箋要素を作成（青色）
 */
export const createEmailStickyNote = (
  x: number,
  y: number,
  subject: string,
  filePath?: string
): NonDeletedExcalidrawElement[] => {
  return createStickyNoteElements(
    x,
    y,
    subject,
    filePath,
    '#e3f2fd', // 薄い青色（メール専用）
    '#1976d2'  // 濃い青色（ストローク）
  );
};

/**
 * メール専用の付箋要素を作成（青色、フルパス付き）
 */
export const createEmailStickyNoteWithFullPath = (
  x: number,
  y: number,
  subject: string,
  fullPath: string
): NonDeletedExcalidrawElement[] => {
  return createStickyNoteElementsWithFullPath(
    x,
    y,
    subject,
    fullPath,
    '#e3f2fd', // 薄い青色（メール専用）
    '#1976d2'  // 濃い青色（ストローク）
  );
};

/**
 * Outlookメールデータをサーバーに保存
 */
export const saveOutlookEmail = async (
  emailData: string,
  subject: string,
  currentPath: string
): Promise<EmailSaveResponse> => {
  try {
    const response = await fetch(`http://${window.location.hostname}:8008/api/save-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        emailData,
        subject,
        currentPath
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error saving Outlook email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * メールファイル（.eml, .msg）をサーバーにアップロード
 */
export const uploadEmailFile = async (
  file: File,
  currentPath: string
): Promise<EmailSaveResponse> => {
  try {
    const formData = new FormData();
    formData.append('files', file);
    formData.append('current_path', currentPath);
    formData.append('file_type', 'email');

    const response = await fetch(`http://${window.location.hostname}:8008/api/upload-files`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success && result.files && result.files.length > 0) {
      return {
        success: true,
        savedPath: result.files[0].path
      };
    } else {
      return {
        success: false,
        error: result.error || 'Upload failed'
      };
    }
  } catch (error) {
    console.error('Error uploading email file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * メールの件名を適切な長さに調整
 */
export const formatEmailSubject = (subject: string, maxLength: number = 25): string => {
  if (subject.length <= maxLength) {
    return subject;
  }
  return subject.substring(0, maxLength - 3) + '...';
};

/**
 * メールファイルかどうかを判定
 */
export const isEmailFile = (file: File): boolean => {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.eml') || fileName.endsWith('.msg');
};

/**
 * HTMLからプレーンテキストを抽出
 */
export const extractTextFromHtml = (html: string): string => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || '';
};

/**
 * メールファイルから件名を抽出
 */
export const extractEmailSubjectFromFile = async (file: File): Promise<string | null> => {
  try {
    const text = await file.text();
    const subjectMatch = text.match(/^Subject:\s*(.+)$/m);
    return subjectMatch ? subjectMatch[1].trim() : null;
  } catch (error) {
    console.error('Error extracting email subject:', error);
    return null;
  }
};

/**
 * メールデータの形式を正規化
 */
export const normalizeEmailData = (data: string, type: string): EmailData => {
  let subject = 'Email';
  let content = data;

  try {
    if (type === 'text/html') {
      const textContent = extractTextFromHtml(data);
      const lines = textContent.split('\n').filter(line => line.trim());
      if (lines.length > 0) {
        subject = lines[0].trim();
      }
      content = textContent;
    } else if (type === 'text/x-moz-url') {
      const urlParts = data.split('\n');
      if (urlParts.length > 1) {
        subject = urlParts[1];
      }
    } else if (type === 'text/plain') {
      const lines = data.split('\n').filter(line => line.trim());
      if (lines.length > 0) {
        subject = lines[0].trim();
      }
    }
  } catch (error) {
    console.warn('Error normalizing email data:', error);
  }

  return {
    subject: subject || 'Email',
    data: content
  };
};