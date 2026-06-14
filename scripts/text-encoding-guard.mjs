import fs from 'node:fs/promises';
import path from 'node:path';

const ignoredDirectoryNames = new Set([
  '.codegraph',
  '.git',
  '.vite',
  '.webapp-editor-build',
  '.webapp-editor.local',
  'coverage',
  'dist',
  'node_modules'
]);

const textFileExtensions = new Set([
  '.cmd',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt'
]);

const textFileNames = new Set([
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  'AGENTS.md',
  'README.md'
]);

const commonChineseMojibakeSequences = [
  '\u699b\u6a3f',
  '\u93c2\u56e6',
  '\u6dc7\u6fc6',
  '\u6924\u572d',
  '\u752f\u51a8',
  '\u68f0\u52ee',
  '\u93b5\u64b3',
  '\u93bc\u6ec5',
  '\u5a34\u5fda',
  '\u9359\u6828',
  '\u7ead\ue1bf',
  '\u9352\u6d98',
  '\u6fb6\u5d85',
  '\u95b2\u5d85',
  '\u6434\u65c2',
  '\u9352\u72bb',
  '\u8930\u64b3',
  '\u6d93\u5d84',
  '\u9a9e\u8235',
  '\u748b\u51ad',
  '\u7039\u85c9',
  '\u7ecc\u8679'
];

const suspiciousTextPatterns = [
  {
    reason: 'Unicode replacement character',
    pattern: /\uFFFD/
  },
  {
    reason: 'private-use character, often produced by UTF-8/GBK mojibake',
    pattern: /[\uE000-\uF8FF]/
  },
  {
    reason: 'C1 control character, often produced by Windows-1252 mojibake',
    pattern: /[\u0080-\u009F]/
  },
  {
    reason: 'common Chinese UTF-8/GBK mojibake sequence',
    pattern: new RegExp(`(?:${commonChineseMojibakeSequences.join('|')})`)
  }
];

function isTextFile(filePath) {
  return textFileExtensions.has(path.extname(filePath).toLowerCase()) || textFileNames.has(path.basename(filePath));
}

function getLineColumn(text, index) {
  const prefix = text.slice(0, index);
  const lines = prefix.split(/\r\n|\r|\n/);
  return {
    line: lines.length,
    column: lines.at(-1).length + 1
  };
}

function getSnippet(text, index) {
  const start = Math.max(0, index - 32);
  const end = Math.min(text.length, index + 32);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

export function findSuspiciousText(text) {
  const issues = [];

  for (const { reason, pattern } of suspiciousTextPatterns) {
    const match = pattern.exec(text);
    if (!match) {
      continue;
    }

    issues.push({
      ...getLineColumn(text, match.index),
      reason,
      snippet: getSnippet(text, match.index)
    });
  }

  return issues;
}

export async function scanTextFiles(root) {
  const issues = [];

  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!ignoredDirectoryNames.has(entry.name)) {
          await walk(fullPath);
        }
        continue;
      }

      if (!entry.isFile() || !isTextFile(fullPath)) {
        continue;
      }

      const text = await fs.readFile(fullPath, 'utf8');
      for (const issue of findSuspiciousText(text)) {
        issues.push({
          file: fullPath,
          ...issue
        });
      }
    }
  }

  await walk(root);
  return issues;
}
