/**
 * Load jobs from a JSON config file.
 * Config format:
 * {
 *   "jobs": [
 *     { "essay": "./essays/essay1.txt", "docUrl": "https://docs.google.com/document/d/xxx/edit" },
 *     { "essay": "./essays/essay2.md", "docUrl": "https://docs.google.com/document/d/yyy/edit", "wpm": 50 }
 *   ],
 *   "options": {
 *     "sequential": true,
 *     "wpm": 45,
 *     "simulateTypos": false
 *   }
 * }
 */

import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadConfig(configPath) {
  const path = resolve(process.cwd(), configPath);
  const raw = await readFile(path, 'utf-8');
  const config = JSON.parse(raw);

  const options = config.options || {};
  const jobs = (config.jobs || []).map((j) => ({
    ...options,
    ...j,
  }));

  return { jobs, options: config.options || {} };
}
