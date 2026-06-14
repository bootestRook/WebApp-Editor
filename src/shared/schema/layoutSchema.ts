import type { RuntimeElement, RuntimeStyle, WebAppLayout } from '../../runtime/runtimeTypes';
import {
  BASE_RESOLUTION,
  DEFAULT_ROTATION,
  ELEMENT_TYPES,
  formatSupportedBaseResolutions,
  IMAGE_FIT_VALUES,
  isSupportedBaseResolution,
  TEXT_ALIGN_VALUES
} from './projectContract';

const elementTypes = new Set<string>(ELEMENT_TYPES);
const textAlignValues = new Set<string>(TEXT_ALIGN_VALUES);
const imageFitValues = new Set<string>(IMAGE_FIT_VALUES);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`layout: "${key}" must be a non-empty string`);
  }
  return value;
}

function requireNumber(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`layout: "${key}" must be a number`);
  }
  return value;
}

function optionalRootString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`layout: "${key}" must be a string`);
  }
  return value;
}

function optionalRootNumber(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`layout: "${key}" must be a finite number`);
  }
  return Math.round(value);
}

function requireElementId(source: Record<string, unknown>) {
  const id = requireString(source, 'id');
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
    throw new Error(`layout: element id "${id}" must start with a letter and contain only letters, numbers, "_" or "-"`);
  }
  return id;
}

function optionalString(source: Record<string, unknown>, key: string, target: RuntimeStyle) {
  const value = source[key];
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'string') {
    throw new Error(`layout style: "${key}" must be a string`);
  }
  (target as Record<string, unknown>)[key] = value;
}

function optionalNumber(source: Record<string, unknown>, key: string, target: RuntimeStyle) {
  const value = source[key];
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`layout style: "${key}" must be a finite number`);
  }
  (target as Record<string, unknown>)[key] = value;
}

function parseStyle(value: unknown): RuntimeStyle | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isObject(value)) {
    throw new Error('layout: "style" must be an object when provided');
  }

  const style: RuntimeStyle = {};
  optionalString(value, 'fill', style);
  optionalString(value, 'color', style);
  optionalString(value, 'borderColor', style);
  optionalNumber(value, 'borderWidth', style);
  optionalNumber(value, 'radius', style);
  optionalNumber(value, 'fontSize', style);
  optionalNumber(value, 'fontWeight', style);

  if (value.textAlign !== undefined) {
    if (typeof value.textAlign !== 'string' || !textAlignValues.has(value.textAlign)) {
      throw new Error(`layout style: "textAlign" must be one of ${TEXT_ALIGN_VALUES.join(', ')}`);
    }
    style.textAlign = value.textAlign as RuntimeStyle['textAlign'];
  }

  if (value.fit !== undefined) {
    if (typeof value.fit !== 'string' || !imageFitValues.has(value.fit)) {
      throw new Error(`layout style: "fit" must be one of ${IMAGE_FIT_VALUES.join(', ')}`);
    }
    style.fit = value.fit as RuntimeStyle['fit'];
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function assertProjectAssetReference(value: string, key: string) {
  if (/^(https?:|data:|\/)/.test(value)) {
    return;
  }

  const parts = value.split('/');
  if (value.includes('\\') || parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    throw new Error(`layout: "${key}" must be a normalized asset path`);
  }
}

function assertProjectPathReference(value: string, key: string) {
  const parts = value.split('/');
  if (
    /^(https?:|data:|\/)/.test(value) ||
    value.includes('\\') ||
    parts.some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    throw new Error(`layout: "${key}" must be a normalized project path`);
  }
}

function parseScriptBindings(value: unknown): RuntimeElement['scripts'] {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error('layout: "scripts" must be an array when provided');
  }

  return value.map((script, index) => {
    if (!isObject(script)) {
      throw new Error(`layout: scripts[${index}] must be an object`);
    }

    const binding = {
      id: requireString(script, 'id'),
      name: requireString(script, 'name'),
      enabled: typeof script.enabled === 'boolean' ? script.enabled : true,
      path: typeof script.path === 'string' && script.path.length > 0 ? script.path : undefined
    };

    if (binding.path) {
      assertProjectPathReference(binding.path, `scripts[${index}].path`);
    }

    return binding;
  });
}

export function parseRuntimeElementSchema(value: unknown): RuntimeElement {
  if (!isObject(value)) {
    throw new Error('layout: each element must be an object');
  }

  const type = requireString(value, 'type');
  if (!elementTypes.has(type)) {
    throw new Error(`layout: unsupported element type "${type}"`);
  }

  const element: RuntimeElement = {
    id: requireElementId(value),
    type: type as RuntimeElement['type'],
    name: requireString(value, 'name'),
    x: Math.round(requireNumber(value, 'x')),
    y: Math.round(requireNumber(value, 'y')),
    width: Math.max(1, Math.round(requireNumber(value, 'width'))),
    height: Math.max(1, Math.round(requireNumber(value, 'height'))),
    rotation: optionalRootNumber(value, 'rotation'),
    visible: typeof value.visible === 'boolean' ? value.visible : undefined,
    layerGroup: optionalRootString(value, 'layerGroup'),
    layerOrder: optionalRootNumber(value, 'layerOrder'),
    orderInLayer: optionalRootNumber(value, 'orderInLayer'),
    style: parseStyle(value.style),
    scripts: parseScriptBindings(value.scripts)
  };

  if (typeof value.text === 'string') {
    element.text = value.text;
  }

  if (typeof value.src === 'string') {
    assertProjectAssetReference(value.src, 'src');
    element.src = value.src;
  }

  if (typeof value.sourceAsset === 'string') {
    assertProjectAssetReference(value.sourceAsset, 'sourceAsset');
    element.sourceAsset = value.sourceAsset;
  }

  return element;
}

export function normalizeLayout(layout: WebAppLayout): WebAppLayout {
  const baseResolution = layout.baseResolution ?? BASE_RESOLUTION;

  return {
    ...layout,
    baseResolution: {
      width: Math.round(baseResolution.width),
      height: Math.round(baseResolution.height)
    },
    elements: layout.elements.map((element) => ({
      ...element,
      x: Math.round(element.x),
      y: Math.round(element.y),
      width: Math.max(1, Math.round(element.width)),
      height: Math.max(1, Math.round(element.height)),
      rotation: element.rotation === undefined || element.rotation === DEFAULT_ROTATION ? undefined : Math.round(element.rotation),
      layerOrder: element.layerOrder === undefined ? undefined : Math.round(element.layerOrder),
      orderInLayer: element.orderInLayer === undefined ? undefined : Math.round(element.orderInLayer)
    }))
  };
}

export function parseLayoutSchema(value: unknown): WebAppLayout {
  if (!isObject(value)) {
    throw new Error('layout JSON must be an object');
  }

  const baseResolution = value.baseResolution;
  if (!isObject(baseResolution)) {
    throw new Error('layout: "baseResolution" must be an object');
  }

  const elements = value.elements;
  if (!Array.isArray(elements)) {
    throw new Error('layout: "elements" must be an array');
  }

  const layout: WebAppLayout = {
    id: requireString(value, 'id'),
    name: requireString(value, 'name'),
    baseResolution: {
      width: requireNumber(baseResolution, 'width'),
      height: requireNumber(baseResolution, 'height')
    },
    elements: elements.map(parseRuntimeElementSchema)
  };

  const ids = new Set<string>();
  for (const element of layout.elements) {
    if (ids.has(element.id)) {
      throw new Error(`layout: duplicate element id "${element.id}"`);
    }
    ids.add(element.id);
  }

  if (!isSupportedBaseResolution(layout.baseResolution)) {
    throw new Error(`layout: baseResolution must be one of ${formatSupportedBaseResolutions()}`);
  }

  return normalizeLayout(layout);
}
