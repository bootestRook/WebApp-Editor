import type { RuntimeElement } from '../../runtime/runtimeTypes';
import { parseRuntimeElementSchema } from './layoutSchema';
import { WEBAPP_PROJECT_VERSION } from './projectContract';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`component asset: "${key}" must be a non-empty string`);
  }
  return value;
}

function requireVersion(source: Record<string, unknown>): typeof WEBAPP_PROJECT_VERSION {
  const value = source.version;
  if (value !== WEBAPP_PROJECT_VERSION) {
    throw new Error(`component asset: "version" must be ${WEBAPP_PROJECT_VERSION}`);
  }
  return WEBAPP_PROJECT_VERSION;
}

export type WebAppComponentAsset = {
  version: typeof WEBAPP_PROJECT_VERSION;
  kind: 'component';
  name: string;
  element: RuntimeElement;
};

export function parseComponentAssetSchema(value: unknown): WebAppComponentAsset {
  if (!isObject(value)) {
    throw new Error('component asset JSON must be an object');
  }

  const kind = requireString(value, 'kind');
  if (kind !== 'component') {
    throw new Error('component asset: "kind" must be "component"');
  }

  return {
    version: requireVersion(value),
    kind,
    name: requireString(value, 'name'),
    element: parseRuntimeElementSchema(value.element)
  };
}
