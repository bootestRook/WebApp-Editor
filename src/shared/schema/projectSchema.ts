import type { WebAppProject } from '../../runtime/runtimeTypes';
import {
  DEFAULT_ASSETS_ROOT,
  DEFAULT_ENTRY_LAYOUT,
  formatSupportedBaseResolutions,
  isSupportedBaseResolution,
  WEBAPP_ENGINE,
  WEBAPP_PROJECT_VERSION
} from './projectContract';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`project.webapp.json: "${key}" must be a non-empty string`);
  }
  return value;
}

function requireNumber(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`project.webapp.json: "${key}" must be a number`);
  }
  return value;
}

function requireProjectPath(source: Record<string, unknown>, key: string) {
  const value = requireString(source, key);
  const parts = value.split('/');
  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    parts.some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    throw new Error(`project.webapp.json: "${key}" must be a normalized relative project path`);
  }
  return value;
}

export function parseProjectSchema(value: unknown): WebAppProject {
  if (!isObject(value)) {
    throw new Error('project.webapp.json must be an object');
  }

  const baseResolution = value.baseResolution;
  if (!isObject(baseResolution)) {
    throw new Error('project.webapp.json: "baseResolution" must be an object');
  }

  const project: WebAppProject = {
    engine: requireString(value, 'engine') as WebAppProject['engine'],
    version: requireNumber(value, 'version'),
    name: requireString(value, 'name'),
    baseResolution: {
      width: requireNumber(baseResolution, 'width'),
      height: requireNumber(baseResolution, 'height')
    },
    entryLayout: requireProjectPath(value, 'entryLayout'),
    assetsRoot: requireProjectPath(value, 'assetsRoot')
  };

  if (project.engine !== WEBAPP_ENGINE) {
    throw new Error(`project.webapp.json: "engine" must be "${WEBAPP_ENGINE}"`);
  }

  if (project.version !== WEBAPP_PROJECT_VERSION) {
    throw new Error(`project.webapp.json: "version" must be ${WEBAPP_PROJECT_VERSION}`);
  }

  if (!isSupportedBaseResolution(project.baseResolution)) {
    throw new Error(`project.webapp.json: baseResolution must be one of ${formatSupportedBaseResolutions()}`);
  }

  if (!project.entryLayout.endsWith('.json')) {
    throw new Error(`project.webapp.json: "entryLayout" must point to a JSON layout such as ${DEFAULT_ENTRY_LAYOUT}`);
  }

  if (project.assetsRoot !== DEFAULT_ASSETS_ROOT) {
    throw new Error(`project.webapp.json: "assetsRoot" must be "${DEFAULT_ASSETS_ROOT}" in protocol v${WEBAPP_PROJECT_VERSION}`);
  }

  return project;
}
