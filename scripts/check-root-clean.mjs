import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forbiddenRootFilePattern = /\.(log|tmp|pid)$/i;

const entries = await fs.readdir(editorRoot, { withFileTypes: true });
const forbidden = entries
  .filter((entry) => entry.isFile() && forbiddenRootFilePattern.test(entry.name))
  .map((entry) => entry.name)
  .sort();

if (forbidden.length > 0) {
  console.error('Root directory must stay clean. Move or delete these generated files:');
  for (const file of forbidden) {
    console.error(`- ${file}`);
  }
  console.error('Use a temp directory or a dedicated logs directory outside the framework root for diagnostics.');
  process.exit(1);
}

console.log('Root directory clean.');
