import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(scriptDir, '..');
const targetArg = process.argv[2];

function usage() {
  console.error('Usage: npm run new-project -- <project-folder>');
  console.error('Example: npm run new-project -- "F:\\WebApp Projects\\Inventory App"');
}

function projectPath(value) {
  return value.replaceAll(path.sep, '/');
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

if (!targetArg) {
  usage();
  process.exit(1);
}

const projectRoot = path.resolve(process.cwd(), targetArg);
const projectName = process.env.WEBAPP_PROJECT_NAME?.trim() || path.basename(projectRoot) || 'WebApp Project';
const manifestFile = path.join(projectRoot, 'project.webapp.json');

try {
  await fs.stat(manifestFile);
  console.error(`Project already exists: ${manifestFile}`);
  process.exit(1);
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

await fs.mkdir(path.join(projectRoot, 'layouts'), { recursive: true });
await fs.mkdir(path.join(projectRoot, 'assets', 'ui'), { recursive: true });
await fs.mkdir(path.join(projectRoot, 'assets', 'components'), { recursive: true });
await fs.mkdir(path.join(projectRoot, 'data'), { recursive: true });
await fs.mkdir(path.join(projectRoot, 'scripts'), { recursive: true });

await writeJson(manifestFile, {
  engine: 'webapp-editor',
  version: 1,
  name: projectName,
  baseResolution: {
    width: 1920,
    height: 1080
  },
  entryLayout: 'layouts/main_page.layout.json',
  assetsRoot: 'assets'
});

await writeJson(path.join(projectRoot, 'layouts', 'main_page.layout.json'), {
  id: 'main_page',
  name: 'Main Page',
  baseResolution: {
    width: 1920,
    height: 1080
  },
  elements: [
    {
      id: 'background',
      type: 'panel',
      name: 'Background',
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      style: {
        fill: '#10141b'
      }
    },
    {
      id: 'headline',
      type: 'text',
      name: 'Headline',
      x: 135,
      y: 120,
      width: 1125,
      height: 90,
      text: projectName,
      style: {
        color: '#f3f7ff',
        fontSize: 54,
        fontWeight: 800,
        textAlign: 'left'
      }
    },
    {
      id: 'body_copy',
      type: 'text',
      name: 'Body Copy',
      x: 138,
      y: 233,
      width: 990,
      height: 90,
      text: 'This project is editable in WebApp Editor and runnable through /play.',
      style: {
        color: '#9fb0c6',
        fontSize: 26,
        fontWeight: 500,
        textAlign: 'left'
      }
    },
    {
      id: 'primary_action',
      type: 'button',
      name: 'Primary Action',
      x: 138,
      y: 368,
      width: 270,
      height: 72,
      text: 'Start',
      style: {
        fill: '#2f80ed',
        color: '#ffffff',
        fontSize: 24,
        fontWeight: 800,
        radius: 16
      }
    }
  ]
});

await fs.writeFile(
  path.join(projectRoot, 'assets', 'ui', 'project-mark.svg'),
  `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="18" y="18" width="220" height="220" rx="40" fill="#1C2636"/>
  <rect x="52" y="58" width="152" height="54" rx="18" fill="#2F80ED"/>
  <rect x="52" y="132" width="68" height="66" rx="18" fill="#58D68D"/>
  <rect x="136" y="132" width="68" height="66" rx="18" fill="#F2C94C"/>
</svg>
`,
  'utf8'
);

const relativeEditor = projectPath(path.relative(projectRoot, editorRoot)) || projectPath(editorRoot);
await fs.writeFile(
  path.join(projectRoot, 'AGENTS.md'),
  `# Project AI Instructions

This is a WebApp Editor project. The editor framework is located at:

\`\`\`text
${relativeEditor}
\`\`\`

Prefer editing project assets in this folder:

- \`project.webapp.json\`
- \`layouts/*.layout.json\`
- \`assets/**\`
- \`data/**\`
- \`scripts/**\`

Do not modify the WebApp Editor framework unless the user explicitly asks for an engine/editor feature.

Validate this project from the editor folder:

\`\`\`powershell
cd "${editorRoot}"
npm run validate-project -- "${projectRoot}"
\`\`\`

Open it in the editor:

\`\`\`powershell
cd "${editorRoot}"
npm run dev:project -- "${projectRoot}"
\`\`\`
`,
  'utf8'
);

console.log(`Created WebApp Editor project: ${projectRoot}`);
console.log(`Open it with: npm run dev:project -- "${projectRoot}"`);
