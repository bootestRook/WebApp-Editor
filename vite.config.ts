import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import { parseRuntimeElementSchema, parseLayoutSchema } from './src/shared/schema/layoutSchema';
import { parseProjectSchema } from './src/shared/schema/projectSchema';
import { parseComponentAssetSchema } from './src/shared/schema/componentSchema';
import { PROJECT_FILE_NAME, WEBAPP_PROJECT_VERSION } from './src/shared/schema/projectContract';

declare global {
  interface Worker {}
}

const configuredProjectDir = process.env.WEBAPP_PROJECT_DIR
  ? path.resolve(process.env.WEBAPP_PROJECT_DIR)
  : null;
let activeProjectDir: string | null = configuredProjectDir;
let activeLayoutPath: string | null = null;
const editorLocalDir = path.resolve(
  process.env.WEBAPP_EDITOR_STATE_DIR ??
    path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'WebApp Editor')
);
const editorLayoutFile = path.join(editorLocalDir, 'editor-layout.json');
const buildOutDir = path.resolve(process.env.WEBAPP_EDITOR_BUILD_DIR ?? path.join(__dirname, '.webapp-editor-build'));

type ProjectFileEntry = {
  name: string;
  path: string;
  assetPath?: string;
  url: string;
  size: number;
  kind: string;
};

async function sendJson(res: ServerResponse, value: unknown, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(value, null, 2));
}

async function readRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function escapePowerShellString(value: string) {
  return value.replaceAll("'", "''");
}

function requireActiveProjectDir() {
  if (!activeProjectDir) {
    throw new Error('No WebApp project is open. Use npm run dev:project -- <project-folder> or Open Project.');
  }
  return activeProjectDir;
}

async function readProjectMetadata(projectRoot = activeProjectDir) {
  if (!projectRoot) {
    throw new Error('No WebApp project is open. Use npm run dev:project -- <project-folder> or Open Project.');
  }

  const projectFile = path.join(projectRoot, PROJECT_FILE_NAME);
  const raw = await fs.readFile(projectFile, 'utf8');
  const project = parseProjectSchema(JSON.parse(raw));

  return {
    raw,
    project
  };
}

async function getActiveLayoutFile() {
  const projectDir = requireActiveProjectDir();
  if (activeLayoutPath) {
    const layoutFile = path.resolve(activeLayoutPath);
    if (!isInside(projectDir, layoutFile)) {
      throw new Error('Active layout must stay inside the project folder');
    }
    return layoutFile;
  }

  const { project } = await readProjectMetadata();
  const layoutFile = path.resolve(projectDir, project.entryLayout);
  if (!isInside(projectDir, layoutFile)) {
    throw new Error('Project entryLayout must stay inside the project folder');
  }
  return layoutFile;
}

async function setActiveLayout(relativeLayoutPath: string) {
  const projectDir = requireActiveProjectDir();
  const layoutFile = path.resolve(projectDir, relativeLayoutPath);
  if (!isInside(projectDir, layoutFile)) {
    throw new Error('Layout path must stay inside the project folder');
  }

  const stat = await fs.stat(layoutFile);
  if (!stat.isFile()) {
    throw new Error('Selected layout is not a file');
  }
  if (path.extname(layoutFile).toLowerCase() !== '.json') {
    throw new Error('Selected layout must be a JSON file');
  }

  parseLayoutSchema(JSON.parse(await fs.readFile(layoutFile, 'utf8')));
  activeLayoutPath = layoutFile;
  return path.relative(projectDir, layoutFile).replaceAll('\\', '/');
}

async function getActiveAssetsDir() {
  const projectDir = requireActiveProjectDir();
  const { project } = await readProjectMetadata();
  const assetsDir = path.resolve(projectDir, project.assetsRoot);
  if (!isInside(projectDir, assetsDir)) {
    throw new Error('Project assetsRoot must stay inside the project folder');
  }
  await fs.mkdir(assetsDir, { recursive: true });
  return assetsDir;
}

async function validateProjectRoot(candidateDir: string) {
  const resolvedDir = path.resolve(candidateDir);
  const { project } = await readProjectMetadata(resolvedDir);
  const layoutFile = path.resolve(resolvedDir, project.entryLayout);
  const assetsDir = path.resolve(resolvedDir, project.assetsRoot);

  if (!isInside(resolvedDir, layoutFile) || !isInside(resolvedDir, assetsDir)) {
    throw new Error('Project files must stay inside the selected folder');
  }

  const layoutStat = await fs.stat(layoutFile);
  if (!layoutStat.isFile()) {
    throw new Error('Project entryLayout is not a file');
  }
  parseLayoutSchema(JSON.parse(await fs.readFile(layoutFile, 'utf8')));
  await fs.mkdir(assetsDir, { recursive: true });
  return resolvedDir;
}

function pickProjectDirectory() {
  const selectedPath = activeProjectDir ?? process.cwd();
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$dialog.Description = 'Select WebApp project folder'",
    `$dialog.SelectedPath = '${escapePowerShellString(selectedPath)}'`,
    '$result = $dialog.ShowDialog()',
    'if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }'
  ].join('; ');

  return new Promise<string | null>((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: false }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      const selected = stdout.trim();
      resolve(selected || null);
    });
  });
}

function getAssetKind(filePath: string) {
  if (filePath.endsWith('.component.webapp.json')) {
    return 'component';
  }

  const ext = path.extname(filePath).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].includes(ext)) {
    return 'image';
  }
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    return 'script';
  }
  if (['.json', '.webapp'].includes(ext)) {
    return 'data';
  }
  if (['.mp3', '.wav', '.ogg'].includes(ext)) {
    return 'audio';
  }
  if (['.fx', '.effect'].includes(ext)) {
    return 'effect';
  }
  return 'unknown';
}

async function listAssets(dir: string, prefix = ''): Promise<Array<{ name: string; path: string; url: string; size: number; kind: string }>> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const assets = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      const assetPath = `${prefix}${prefix ? '/' : ''}${entry.name}`.replaceAll('\\', '/');
      if (entry.isDirectory()) {
        return [
          {
            name: entry.name,
            path: assetPath,
            url: '',
            size: 0,
            kind: 'folder'
          },
          ...(await listAssets(fullPath, assetPath))
        ];
      }

      if (assetPath.endsWith('.webapp.json') && !assetPath.endsWith('.component.webapp.json')) {
        return [];
      }

      const stat = await fs.stat(fullPath);
      return [
        {
          name: entry.name,
          path: assetPath,
          url: `/__webapp_editor/assets/${assetPath}`,
          size: stat.size,
          kind: getAssetKind(fullPath)
        }
      ];
    })
  );

  return assets.flat();
}

async function listLayouts(
  dir = path.join(requireActiveProjectDir(), 'layouts'),
  prefix = 'layouts'
): Promise<Array<{ name: string; path: string; url: string; size: number; kind: string }>> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const layouts = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        const projectPath = `${prefix}${prefix ? '/' : ''}${entry.name}`.replaceAll('\\', '/');
        if (entry.isDirectory()) {
          return [
            {
              name: entry.name,
              path: projectPath,
              url: '',
              size: 0,
              kind: 'folder'
            },
            ...(await listLayouts(fullPath, projectPath))
          ];
        }

        const stat = await fs.stat(fullPath);
        return [
          {
            name: entry.name,
            path: projectPath,
            url: '',
            size: stat.size,
            kind: path.extname(fullPath).toLowerCase() === '.json' ? 'layout' : 'data'
          }
        ];
      })
    );

    return [
      {
        name: 'layouts',
        path: 'layouts',
        url: '',
        size: 0,
        kind: 'folder'
      },
      ...layouts.flat()
    ];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function listProjectFiles(
  dir = activeProjectDir,
  prefix = '',
  assetsDir?: string
): Promise<ProjectFileEntry[]> {
  const projectDir = requireActiveProjectDir();
  const rootDir = dir ?? projectDir;
  const activeAssetsDir = assetsDir ?? (await getActiveAssetsDir());
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootDir, entry.name);
      const projectPath = `${prefix}${prefix ? '/' : ''}${entry.name}`.replaceAll('\\', '/');
      if (entry.isDirectory()) {
        return [
          {
            name: entry.name,
            path: projectPath,
            url: '',
            size: 0,
            kind: 'folder'
          },
          ...(await listProjectFiles(fullPath, projectPath, activeAssetsDir))
        ];
      }

      const stat = await fs.stat(fullPath);
      const assetPath = isInside(activeAssetsDir, fullPath)
        ? path.relative(activeAssetsDir, fullPath).replaceAll('\\', '/')
        : undefined;
      const isLayoutFile = projectPath.startsWith('layouts/') && path.extname(fullPath).toLowerCase() === '.json';
      return [
        {
          name: entry.name,
          path: projectPath,
          assetPath,
          url: assetPath ? `/__webapp_editor/assets/${assetPath}` : '',
          size: stat.size,
          kind: isLayoutFile ? 'layout' : getAssetKind(fullPath)
        }
      ];
    })
  );

  return files.flat();
}

function devEditorApi(): Plugin {
  return {
    name: 'webapp-editor-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';

        try {
          if (req.method === 'GET' && url === '/__webapp_editor/editor-layout') {
            try {
              const data = await fs.readFile(editorLayoutFile, 'utf8');
              await sendJson(res, { ok: true, layout: JSON.parse(data) });
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                await sendJson(res, { ok: true, layout: null });
                return;
              }
              throw error;
            }
            return;
          }

          if (req.method === 'POST' && url === '/__webapp_editor/editor-layout') {
            const body = await readRequestBody(req);
            const parsed = JSON.parse(body) as unknown;
            await fs.mkdir(editorLocalDir, { recursive: true });
            await fs.writeFile(editorLayoutFile, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
            await sendJson(res, { ok: true, target: path.relative(__dirname, editorLayoutFile).replaceAll('\\', '/') });
            return;
          }

          if (req.method === 'GET' && url === '/__webapp_editor/project') {
            const { raw } = await readProjectMetadata();
            res.setHeader('Content-Type', 'application/json');
            res.end(raw);
            return;
          }

          if (req.method === 'GET' && url === '/__webapp_editor/layout') {
            const layoutFile = await getActiveLayoutFile();
            const data = await fs.readFile(layoutFile, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
            return;
          }

          if (req.method === 'POST' && url === '/__webapp_editor/save-layout') {
            const projectDir = requireActiveProjectDir();
            const layoutFile = await getActiveLayoutFile();
            const body = await readRequestBody(req);
            const parsed = parseLayoutSchema(JSON.parse(body));
            await fs.writeFile(layoutFile, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
            await sendJson(res, { ok: true, target: path.relative(projectDir, layoutFile).replaceAll('\\', '/') });
            return;
          }

          if (req.method === 'POST' && url === '/__webapp_editor/open-layout') {
            const body = JSON.parse(await readRequestBody(req)) as { path?: string };
            if (!body.path) {
              await sendJson(res, { error: 'Layout path is required' }, 400);
              return;
            }

            const layoutPath = await setActiveLayout(body.path);
            await sendJson(res, { ok: true, layoutPath });
            return;
          }

          if (req.method === 'GET' && url === '/__webapp_editor/assets') {
            const projectDir = requireActiveProjectDir();
            const assetsDir = await getActiveAssetsDir();
            await sendJson(res, { root: 'project', assets: await listProjectFiles(projectDir, '', assetsDir) });
            return;
          }

          if (req.method === 'GET' && url.startsWith('/__webapp_editor/asset-defaults/')) {
            const requested = decodeURIComponent(url.replace('/__webapp_editor/asset-defaults/', ''));
            const assetsDir = await getActiveAssetsDir();
            const assetPath = path.resolve(assetsDir, requested);
            if (!isInside(assetsDir, assetPath)) {
              await sendJson(res, { error: 'Invalid asset path' }, 400);
              return;
            }

            try {
              const data = await fs.readFile(`${assetPath}.webapp.json`, 'utf8');
              await sendJson(res, JSON.parse(data));
            } catch (error) {
              const code = (error as NodeJS.ErrnoException).code;
              if (code === 'ENOENT') {
                await sendJson(res, { version: 1, defaults: null });
                return;
              }
              throw error;
            }
            return;
          }

          if (req.method === 'POST' && url === '/__webapp_editor/reveal-asset') {
            const body = JSON.parse(await readRequestBody(req)) as { path?: string };
            const assetsDir = await getActiveAssetsDir();
            const target = body.path ? path.resolve(assetsDir, body.path) : assetsDir;
            if (!isInside(assetsDir, target)) {
              await sendJson(res, { error: 'Invalid asset path' }, 400);
              return;
            }

            if (body.path) {
              execFile('explorer.exe', ['/select,', target]);
            } else {
              execFile('explorer.exe', [target]);
            }
            await sendJson(res, { ok: true, target });
            return;
          }

          if (req.method === 'POST' && url === '/__webapp_editor/reveal-project') {
            const projectDir = requireActiveProjectDir();
            execFile('explorer.exe', [projectDir]);
            await sendJson(res, { ok: true, target: projectDir });
            return;
          }

          if (req.method === 'POST' && url === '/__webapp_editor/reveal-project-file') {
            const projectDir = requireActiveProjectDir();
            const body = JSON.parse(await readRequestBody(req)) as { path?: string };
            const target = body.path ? path.resolve(projectDir, body.path) : projectDir;
            if (!isInside(projectDir, target)) {
              await sendJson(res, { error: 'Invalid project path' }, 400);
              return;
            }

            if (body.path) {
              execFile('explorer.exe', ['/select,', target]);
            } else {
              execFile('explorer.exe', [target]);
            }
            await sendJson(res, { ok: true, target });
            return;
          }

          if (req.method === 'POST' && url === '/__webapp_editor/open-project') {
            const bodyText = await readRequestBody(req);
            const body = bodyText ? (JSON.parse(bodyText) as { path?: string }) : {};
            const selectedDir = body.path ? path.resolve(body.path) : await pickProjectDirectory();
            if (!selectedDir) {
              await sendJson(res, { ok: true, cancelled: true, target: activeProjectDir });
              return;
            }

            activeProjectDir = await validateProjectRoot(selectedDir);
            activeLayoutPath = null;
            const { project } = await readProjectMetadata();
            await sendJson(res, { ok: true, cancelled: false, target: activeProjectDir, projectName: project.name });
            return;
          }

          if (req.method === 'POST' && url === '/__webapp_editor/delete-asset') {
            const body = JSON.parse(await readRequestBody(req)) as { path: string };
            const assetsDir = await getActiveAssetsDir();
            const filePath = path.resolve(assetsDir, body.path);
            if (!isInside(assetsDir, filePath)) {
              await sendJson(res, { error: 'Invalid asset path' }, 400);
              return;
            }

            const stat = await fs.stat(filePath);
            if (!stat.isFile()) {
              await sendJson(res, { error: 'Only file deletion is supported in this prototype' }, 400);
              return;
            }

            await fs.unlink(filePath);
            await sendJson(res, { ok: true });
            return;
          }

          if (req.method === 'POST' && url === '/__webapp_editor/move-asset') {
            const body = JSON.parse(await readRequestBody(req)) as { sourcePath: string; targetFolder: string };
            const assetsRoot = await getActiveAssetsDir();
            const sourcePath = path.resolve(assetsRoot, body.sourcePath);
            const targetFolder = path.resolve(assetsRoot, body.targetFolder || '.');
            if (!isInside(assetsRoot, sourcePath) || !isInside(assetsRoot, targetFolder)) {
              await sendJson(res, { error: 'Invalid asset move path' }, 400);
              return;
            }

            const sourceStat = await fs.stat(sourcePath);
            const targetStat = await fs.stat(targetFolder);
            if (!sourceStat.isFile() || !targetStat.isDirectory()) {
              await sendJson(res, { error: 'Only moving files into folders is supported' }, 400);
              return;
            }

            const targetPath = path.resolve(targetFolder, path.basename(sourcePath));
            if (!isInside(assetsRoot, targetPath)) {
              await sendJson(res, { error: 'Invalid target asset path' }, 400);
              return;
            }

            if (sourcePath === targetPath) {
              await sendJson(res, {
                ok: true,
                from: body.sourcePath,
                to: path.relative(assetsRoot, targetPath).replaceAll('\\', '/')
              });
              return;
            }

            try {
              await fs.stat(targetPath);
              await sendJson(res, { error: 'Target file already exists' }, 409);
              return;
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
              }
            }

            await fs.rename(sourcePath, targetPath);
            try {
              await fs.rename(`${sourcePath}.webapp.json`, `${targetPath}.webapp.json`);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
              }
            }

            await sendJson(res, {
              ok: true,
              from: body.sourcePath,
              to: path.relative(assetsRoot, targetPath).replaceAll('\\', '/')
            });
            return;
          }

          if (req.method === 'POST' && url === '/__webapp_editor/create-component-asset') {
            const body = JSON.parse(await readRequestBody(req)) as { name: string; element: unknown };
            const rawName = typeof body.name === 'string' ? body.name.trim() : '';
            const element = parseRuntimeElementSchema(body.element);
            const safeName =
              rawName
                .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
                .replace(/\s+/g, '_')
                .replace(/^\.+/, '')
                .replace(/\.+$/, '') || 'Component';
            const assetsDir = await getActiveAssetsDir();
            const componentsDir = path.resolve(assetsDir, 'components');
            const filePath = path.resolve(componentsDir, `${safeName}.component.webapp.json`);
            if (!isInside(assetsDir, filePath)) {
              await sendJson(res, { error: 'Invalid component asset path' }, 400);
              return;
            }

            await fs.mkdir(componentsDir, { recursive: true });
            const component = parseComponentAssetSchema({
              version: WEBAPP_PROJECT_VERSION,
              kind: 'component',
              name: rawName || safeName,
              element
            });
            await fs.writeFile(
              filePath,
              `${JSON.stringify(component, null, 2)}\n`,
              'utf8'
            );
            await sendJson(res, { ok: true, target: path.relative(assetsDir, filePath).replaceAll('\\', '/') });
            return;
          }

          if (req.method === 'POST' && url === '/__webapp_editor/apply-asset-overrides') {
            const projectDir = requireActiveProjectDir();
            const body = JSON.parse(await readRequestBody(req)) as { sourceAsset: string; element: unknown };
            const element = parseRuntimeElementSchema(body.element);
            const assetsDir = await getActiveAssetsDir();
            const assetPath = path.resolve(assetsDir, body.sourceAsset);
            if (!isInside(assetsDir, assetPath)) {
              await sendJson(res, { error: 'Invalid source asset path' }, 400);
              return;
            }

            if (body.sourceAsset.endsWith('.component.webapp.json')) {
              const element = body.element as { name?: unknown };
              const fallbackName = path.basename(body.sourceAsset).replace(/\.component\.webapp\.json$/i, '');
              await fs.writeFile(
                assetPath,
                `${JSON.stringify(
                  {
                    version: WEBAPP_PROJECT_VERSION,
                    kind: 'component',
                    name: typeof element.name === 'string' && element.name ? element.name : fallbackName,
                    element
                  },
                  null,
                  2
                )}\n`,
                'utf8'
              );
              await sendJson(res, { ok: true, target: path.relative(projectDir, assetPath).replaceAll('\\', '/') });
              return;
            }

            await fs.writeFile(`${assetPath}.webapp.json`, `${JSON.stringify({ version: WEBAPP_PROJECT_VERSION, defaults: element }, null, 2)}\n`, 'utf8');
            await sendJson(res, { ok: true, target: path.relative(projectDir, `${assetPath}.webapp.json`).replaceAll('\\', '/') });
            return;
          }

          if (req.method === 'GET' && url.startsWith('/__webapp_editor/assets/')) {
            const requested = decodeURIComponent(url.replace('/__webapp_editor/assets/', ''));
            const assetsDir = await getActiveAssetsDir();
            const filePath = path.resolve(assetsDir, requested);
            if (!isInside(assetsDir, filePath)) {
              await sendJson(res, { error: 'Invalid asset path' }, 400);
              return;
            }

            const data = await fs.readFile(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const contentTypes: Record<string, string> = {
              '.svg': 'image/svg+xml',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.webp': 'image/webp'
            };
            res.setHeader('Content-Type', contentTypes[ext] ?? 'application/octet-stream');
            res.end(data);
            return;
          }
        } catch (error) {
          await sendJson(
            res,
            {
              error: error instanceof Error ? error.message : 'Unknown editor API error'
            },
            500
          );
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), devEditorApi()],
  build: {
    outDir: buildOutDir,
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      allow: configuredProjectDir ? [__dirname, configuredProjectDir] : [__dirname]
    }
  }
});
