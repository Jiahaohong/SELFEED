import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcesPath = path.join(__dirname, 'sources.json');

const loadSources = () => {
  try {
    const raw = fs.readFileSync(sourcesPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.error('Failed to load sources.json', error);
  }

  return [];
};

export const sources = loadSources();
