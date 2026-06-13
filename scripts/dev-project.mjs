import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(scriptDir, '..');
const args = process.argv.slice(2);
const projectArg = args[0];
const viteArgs = args.slice(1);

function usage() {
  console.error('Usage: npm run dev:project -- <project-folder> [vite args]');
  console.error('Example: npm run dev:project -- "F:\\WebApp Projects\\Inventory App" --port 5174');
}

if (!projectArg || projectArg.startsWith('-')) {
  usage();
  process.exit(1);
}

const projectRoot = path.resolve(process.cwd(), projectArg);
const manifestFile = path.join(projectRoot, 'project.webapp.json');

if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
  console.error(`Project folder does not exist: ${projectRoot}`);
  process.exit(1);
}

if (!fs.existsSync(manifestFile)) {
  console.error(`Missing project.webapp.json: ${manifestFile}`);
  console.error('Create one with: npm run new-project -- <project-folder>');
  process.exit(1);
}

const viteEntry = path.join(editorRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(
  process.execPath,
  [viteEntry, '--host', '127.0.0.1', ...viteArgs],
  {
    cwd: editorRoot,
    env: {
      ...process.env,
      WEBAPP_PROJECT_DIR: projectRoot
    },
    stdio: 'inherit'
  }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
