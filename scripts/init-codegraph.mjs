import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codegraphDir = path.join(editorRoot, '.codegraph');

function run(commandLine) {
  const result = spawnSync(commandLine, {
    cwd: editorRoot,
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const versionCheck = spawnSync('codegraph --version', {
  cwd: editorRoot,
  shell: process.platform === 'win32',
  stdio: 'ignore'
});

if (versionCheck.error || versionCheck.status !== 0) {
  console.error('CodeGraph CLI is not available on PATH.');
  console.error('Install or expose the `codegraph` command, then run: npm run codegraph:init');
  process.exit(1);
}

const hasCodegraphIndex = fs.existsSync(codegraphDir);

if (hasCodegraphIndex) {
  console.log('CodeGraph index already exists. Refreshing index...');
} else {
  console.log('Initializing CodeGraph index...');
}

run(hasCodegraphIndex ? 'codegraph index' : 'codegraph init -i');
