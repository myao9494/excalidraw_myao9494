import { promises as fs } from 'fs';
import path from 'path';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { filepath, data } = req.body;

  if (!filepath || !data) {
    return res.status(400).json({ error: 'filepath and data are required' });
  }

  try {
    const absolutePath = path.resolve(filepath);
    const dirPath = path.dirname(absolutePath);
    
    // ディレクトリが存在しない場合は作成
    await fs.mkdir(dirPath, { recursive: true });
    
    // ファイルに書き込み
    await fs.writeFile(absolutePath, JSON.stringify(data, null, 2), 'utf8');
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving file:', error);
    res.status(500).json({ error: 'Failed to save file' });
  }
}