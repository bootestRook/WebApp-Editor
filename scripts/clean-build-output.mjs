import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.resolve(process.env.WEBAPP_EDITOR_BUILD_DIR ?? path.join(editorRoot, '.webapp-editor-build'));

if (buildDir === editorRoot || !path.relative(editorRoot, buildDir)) {
  console.error(`Refusing to remove unsafe build directory: ${buildDir}`);
  process.exit(1);
}

await fs.rm(buildDir, { recursive: true, force: true });
console.log(`Removed build output: ${path.relative(editorRoot, buildDir) || buildDir}`);
