import { promises as fs } from 'fs';
import path from 'path';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { filepath } = req.query;

  if (!filepath) {
    return res.status(400).json({ error: 'filepath parameter is required' });
  }

  try {
    const absolutePath = path.resolve(filepath);
    const fileContent = await fs.readFile(absolutePath, 'utf8');
    const data = JSON.parse(fileContent);
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Error loading file:', error);
    
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.status(500).json({ error: 'Failed to load file' });
  }
}