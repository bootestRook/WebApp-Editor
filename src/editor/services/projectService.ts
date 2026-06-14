import type { ProjectAsset, RuntimeElement, WebAppLayout, WebAppProject } from '../../runtime/runtimeTypes';
import { parseLayoutSchema } from '../../shared/schema/layoutSchema';
import { parseProjectSchema } from '../../shared/schema/projectSchema';

type AssetsResponse = {
  assets: ProjectAsset[];
};

export type OpenProjectResult = {
  cancelled: boolean;
  projectName?: string;
  projectPath?: string;
};

async function readEditorApiError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
  } catch {
    // Fall through to the status-based message.
  }

  return `${fallback}: ${response.status}`;
}

export async function loadProject(): Promise<WebAppProject> {
  const response = await fetch('/__webapp_editor/project');
  if (!response.ok) {
    throw new Error(`Failed to load project: ${response.status}`);
  }

  return parseProjectSchema(await response.json());
}

export async function loadAssets(): Promise<ProjectAsset[]> {
  const response = await fetch('/__webapp_editor/assets');
  if (!response.ok) {
    throw new Error(`Failed to load assets: ${response.status}`);
  }

  const data = (await response.json()) as AssetsResponse;
  return Array.isArray(data.assets) ? data.assets : [];
}

export async function revealAsset(path?: string): Promise<void> {
  const response = await fetch('/__webapp_editor/reveal-asset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  if (!response.ok) {
    throw new Error(`Failed to reveal asset: ${response.status}`);
  }
}

export async function revealProject(): Promise<void> {
  const response = await fetch('/__webapp_editor/reveal-project', {
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error(`Failed to reveal project: ${response.status}`);
  }
}

export async function revealProjectFile(path?: string): Promise<void> {
  const response = await fetch('/__webapp_editor/reveal-project-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  if (!response.ok) {
    throw new Error(`Failed to reveal project file: ${response.status}`);
  }
}

export async function openProject(projectPath?: string): Promise<OpenProjectResult> {
  const response = await fetch('/__webapp_editor/open-project', {
    method: 'POST',
    headers: projectPath ? { 'Content-Type': 'application/json' } : undefined,
    body: projectPath ? JSON.stringify({ path: projectPath }) : undefined
  });
  if (!response.ok) {
    throw new Error(await readEditorApiError(response, 'Failed to open project'));
  }

  const data = (await response.json()) as { cancelled?: boolean; projectName?: string; target?: string };
  return {
    cancelled: data.cancelled === true,
    projectName: data.projectName,
    projectPath: data.target
  };
}

export async function createProject(targetPath: string, projectName?: string): Promise<OpenProjectResult> {
  const response = await fetch('/__webapp_editor/create-project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetPath, projectName })
  });
  if (!response.ok) {
    throw new Error(await readEditorApiError(response, 'Failed to create project'));
  }

  const data = (await response.json()) as { ok?: boolean; error?: string; projectName?: string; target?: string };
  if (!data.ok) {
    throw new Error(data.error || 'Failed to create project');
  }

  return {
    cancelled: false,
    projectName: data.projectName ?? projectName,
    projectPath: data.target
  };
}

export async function saveProjectSettings(settings: {
  baseResolution: WebAppProject['baseResolution'];
}): Promise<{ project: WebAppProject; layout: WebAppLayout }> {
  const response = await fetch('/__webapp_editor/save-project-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  if (!response.ok) {
    throw new Error(await readEditorApiError(response, 'Failed to save project settings'));
  }

  const data = (await response.json()) as { project?: unknown; layout?: unknown };
  return {
    project: parseProjectSchema(data.project),
    layout: parseLayoutSchema(data.layout) as WebAppLayout
  };
}

export async function browseProjectParentFolder(initialPath?: string): Promise<string | null> {
  const response = await fetch('/__webapp_editor/browse-project-parent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initialPath })
  });
  if (!response.ok) {
    throw new Error(await readEditorApiError(response, 'Failed to browse parent folder'));
  }

  const data = (await response.json()) as { ok?: boolean; cancelled?: boolean; error?: string; path?: string };
  if (!data.ok) {
    throw new Error(data.error || 'Failed to browse parent folder');
  }

  return data.cancelled ? null : (data.path ?? null);
}

export async function deleteAsset(path: string): Promise<void> {
  const response = await fetch('/__webapp_editor/delete-asset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  if (!response.ok) {
    throw new Error(`Failed to delete asset: ${response.status}`);
  }
}

export async function moveAsset(sourcePath: string, targetFolder: string): Promise<{ from: string; to: string }> {
  const response = await fetch('/__webapp_editor/move-asset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourcePath, targetFolder })
  });
  if (!response.ok) {
    throw new Error(`Failed to move asset: ${response.status}`);
  }

  return (await response.json()) as { from: string; to: string };
}

export async function loadAssetDefaults(path: string): Promise<Partial<RuntimeElement> | null> {
  const response = await fetch(`/__webapp_editor/asset-defaults/${encodeURIComponent(path)}`);
  if (!response.ok) {
    throw new Error(`Failed to load asset defaults: ${response.status}`);
  }

  const data = (await response.json()) as { defaults?: Partial<RuntimeElement> | null };
  return data.defaults ?? null;
}

export async function loadComponentAsset(path: string): Promise<RuntimeElement> {
  const response = await fetch(`/__webapp_editor/assets/${path.split('/').map(encodeURIComponent).join('/')}`);
  if (!response.ok) {
    throw new Error(`Failed to load component asset: ${response.status}`);
  }

  const data = (await response.json()) as { kind?: string; element?: RuntimeElement };
  if (data.kind !== 'component' || !data.element) {
    throw new Error('Selected asset is not a component asset');
  }

  return data.element;
}

export async function createComponentAsset(name: string, element: RuntimeElement): Promise<{ target: string }> {
  const response = await fetch('/__webapp_editor/create-component-asset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, element })
  });
  if (!response.ok) {
    throw new Error(`Failed to create component asset: ${response.status}`);
  }

  return (await response.json()) as { target: string };
}

export async function applyAssetOverrides(sourceAsset: string, element: unknown): Promise<void> {
  const response = await fetch('/__webapp_editor/apply-asset-overrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceAsset, element })
  });
  if (!response.ok) {
    throw new Error(`Failed to apply asset overrides: ${response.status}`);
  }
}
