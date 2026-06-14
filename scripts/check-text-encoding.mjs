import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTextFiles } from './text-encoding-guard.mjs';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const issues = await scanTextFiles(editorRoot);

if (issues.length > 0) {
  console.error('Suspicious text encoding detected. Read and write text files as UTF-8 before editing Chinese UI strings.');
  for (const issue of issues) {
    console.error(
      `- ${path.relative(process.cwd(), issue.file)}:${issue.line}:${issue.column} ${issue.reason}: ${issue.snippet}`
    );
  }
  process.exit(1);
}

console.log('Text encoding clean.');
