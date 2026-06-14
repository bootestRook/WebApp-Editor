import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSuspiciousText } from './text-encoding-guard.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(scriptDir, '..');
const projectArg = process.argv[2];

if (!projectArg) {
  console.error('Usage: npm run validate-project -- <project-folder>');
  process.exit(1);
}

const projectRoot = path.resolve(process.cwd(), projectArg);

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif']);
const externalAssetPattern = /^(https?:|data:|\/)/;

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function addIssue(issues, severity, file, message) {
  issues.push({
    severity,
    file: path.relative(process.cwd(), file || projectRoot) || '.',
    message
  });
}

function readSingleQuotedConst(source, name) {
  const match = source.match(new RegExp(`export const ${name} = '([^']+)' as const;`));
  if (!match) {
    throw new Error(`Unable to read ${name} from projectContract.ts`);
  }
  return match[1];
}

function readNumberConst(source, name) {
  const match = source.match(new RegExp(`export const ${name} = (\\d+);`));
  if (!match) {
    throw new Error(`Unable to read ${name} from projectContract.ts`);
  }
  return Number(match[1]);
}

function readStringArrayConst(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([^\\]]+)\\] as const;`, 's'));
  if (!match) {
    throw new Error(`Unable to read ${name} from projectContract.ts`);
  }
  return Array.from(match[1].matchAll(/'([^']+)'/g), (item) => item[1]);
}

function readBaseResolution(source) {
  const match = source.match(/export const BASE_RESOLUTION = \{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*\} as const;/s);
  if (!match) {
    throw new Error('Unable to read BASE_RESOLUTION from projectContract.ts');
  }
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

function readSupportedBaseResolutions(source, baseResolution) {
  const match = source.match(/export const SUPPORTED_BASE_RESOLUTIONS = \[([\s\S]*?)\] as const;/);
  if (!match) {
    return [baseResolution];
  }

  const resolutions = [baseResolution];
  for (const item of match[1].matchAll(/\{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*\}/g)) {
    resolutions.push({
      width: Number(item[1]),
      height: Number(item[2])
    });
  }
  return resolutions.filter(
    (resolution, index, sourceList) =>
      sourceList.findIndex((item) => item.width === resolution.width && item.height === resolution.height) === index
  );
}

async function readContract() {
  const source = await fs.readFile(path.join(editorRoot, 'src/shared/schema/projectContract.ts'), 'utf8');
  const baseResolution = readBaseResolution(source);
  return {
    engine: readSingleQuotedConst(source, 'WEBAPP_ENGINE'),
    version: readNumberConst(source, 'WEBAPP_PROJECT_VERSION'),
    baseResolution,
    supportedBaseResolutions: readSupportedBaseResolutions(source, baseResolution),
    elementTypes: new Set(readStringArrayConst(source, 'ELEMENT_TYPES')),
    textAlignValues: new Set(readStringArrayConst(source, 'TEXT_ALIGN_VALUES')),
    imageFitValues: new Set(readStringArrayConst(source, 'IMAGE_FIT_VALUES')),
    defaultEntryLayout: readSingleQuotedConst(source, 'DEFAULT_ENTRY_LAYOUT'),
    defaultAssetsRoot: readSingleQuotedConst(source, 'DEFAULT_ASSETS_ROOT')
  };
}

async function readJson(filePath, issues) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    addIssue(issues, 'error', filePath, error?.code === 'ENOENT' ? 'File does not exist' : error.message);
    return null;
  }

  for (const issue of findSuspiciousText(raw)) {
    addIssue(
      issues,
      'error',
      filePath,
      `Suspicious text encoding at ${issue.line}:${issue.column} (${issue.reason}): ${issue.snippet}`
    );
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    addIssue(issues, 'error', filePath, `Invalid JSON: ${error.message}`);
    return null;
  }
}

function validateProjectPathValue(value, issues, file, label) {
  if (typeof value !== 'string' || value.length === 0) {
    addIssue(issues, 'error', file, `${label} must be a non-empty string`);
    return null;
  }

  const parts = value.split('/');
  if (
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    value.includes('\\') ||
    parts.some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    addIssue(issues, 'error', file, `${label} must be a normalized project-relative path`);
    return null;
  }

  return value;
}

function validateBaseResolution(value, issues, file, contract, label = 'baseResolution') {
  if (!isObject(value)) {
    addIssue(issues, 'error', file, `${label} must be an object`);
    return;
  }

  const supported = contract.supportedBaseResolutions.some(
    (resolution) => value.width === resolution.width && value.height === resolution.height
  );
  if (!supported) {
    addIssue(
      issues,
      'error',
      file,
      `${label} must be one of ${contract.supportedBaseResolutions
        .map((resolution) => `${resolution.width}x${resolution.height}`)
        .join(', ')}`
    );
  }
}

function validateRequiredString(value, issues, file, label) {
  if (typeof value !== 'string' || value.length === 0) {
    addIssue(issues, 'error', file, `${label} must be a non-empty string`);
    return false;
  }
  return true;
}

function validateRequiredNumber(value, issues, file, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    addIssue(issues, 'error', file, `${label} must be a finite number`);
    return false;
  }
  return true;
}

async function walkFiles(root) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const result = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
}

async function validateAssetReference(ref, issues, file, assetsRoot, label, allowExternal) {
  if (typeof ref !== 'string' || ref.length === 0) {
    addIssue(issues, 'error', file, `${label} must be a non-empty string`);
    return;
  }

  if (externalAssetPattern.test(ref)) {
    if (!allowExternal) {
      addIssue(issues, 'error', file, `${label} must point to a local project asset`);
    }
    return;
  }

  const assetPath = validateProjectPathValue(ref, issues, file, label);
  if (!assetPath) {
    return;
  }

  const target = path.resolve(assetsRoot, assetPath);
  if (!isInside(assetsRoot, target)) {
    addIssue(issues, 'error', file, `${label} escapes assetsRoot`);
    return;
  }

  if (!(await exists(target))) {
    addIssue(issues, 'error', file, `${label} points to missing asset "${ref}"`);
    return;
  }

  if (label.endsWith('src') && !imageExtensions.has(path.extname(target).toLowerCase())) {
    addIssue(issues, 'warning', file, `${label} points to a non-image asset "${ref}"`);
  }
}

function validateStyle(style, issues, file, contract, elementLabel) {
  if (style === undefined) {
    return;
  }
  if (!isObject(style)) {
    addIssue(issues, 'error', file, `${elementLabel}.style must be an object`);
    return;
  }

  const stringKeys = new Set(['fill', 'color', 'borderColor']);
  const numberKeys = new Set(['borderWidth', 'radius', 'fontSize', 'fontWeight']);
  const allowedKeys = new Set([...stringKeys, ...numberKeys, 'textAlign', 'fit']);

  for (const [key, value] of Object.entries(style)) {
    if (!allowedKeys.has(key)) {
      addIssue(issues, 'error', file, `${elementLabel}.style.${key} is not part of the protocol`);
      continue;
    }

    if (stringKeys.has(key) && typeof value !== 'string') {
      addIssue(issues, 'error', file, `${elementLabel}.style.${key} must be a string`);
    }
    if (numberKeys.has(key) && (typeof value !== 'number' || !Number.isFinite(value))) {
      addIssue(issues, 'error', file, `${elementLabel}.style.${key} must be a finite number`);
    }
    if (key === 'textAlign' && (typeof value !== 'string' || !contract.textAlignValues.has(value))) {
      addIssue(issues, 'error', file, `${elementLabel}.style.textAlign must be left, center, or right`);
    }
    if (key === 'fit' && (typeof value !== 'string' || !contract.imageFitValues.has(value))) {
      addIssue(issues, 'error', file, `${elementLabel}.style.fit must be cover, contain, or fill`);
    }
  }
}

async function validateElement(element, issues, file, contract, assetsRoot, elementLabel, seenIds) {
  if (!isObject(element)) {
    addIssue(issues, 'error', file, `${elementLabel} must be an object`);
    return;
  }

  if (validateRequiredString(element.id, issues, file, `${elementLabel}.id`)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(element.id)) {
      addIssue(issues, 'error', file, `${elementLabel}.id must start with a letter and contain only letters, numbers, "_" or "-"`);
    }
    if (seenIds) {
      if (seenIds.has(element.id)) {
        addIssue(issues, 'error', file, `${elementLabel}.id duplicates "${element.id}"`);
      }
      seenIds.add(element.id);
    }
  }

  if (validateRequiredString(element.type, issues, file, `${elementLabel}.type`) && !contract.elementTypes.has(element.type)) {
    addIssue(issues, 'error', file, `${elementLabel}.type "${element.type}" is not supported by the runtime`);
  }

  validateRequiredString(element.name, issues, file, `${elementLabel}.name`);
  validateRequiredNumber(element.x, issues, file, `${elementLabel}.x`);
  validateRequiredNumber(element.y, issues, file, `${elementLabel}.y`);

  if (validateRequiredNumber(element.width, issues, file, `${elementLabel}.width`) && element.width <= 0) {
    addIssue(issues, 'error', file, `${elementLabel}.width must be greater than 0`);
  }
  if (validateRequiredNumber(element.height, issues, file, `${elementLabel}.height`) && element.height <= 0) {
    addIssue(issues, 'error', file, `${elementLabel}.height must be greater than 0`);
  }

  if (element.rotation !== undefined && (typeof element.rotation !== 'number' || !Number.isFinite(element.rotation))) {
    addIssue(issues, 'error', file, `${elementLabel}.rotation must be a finite number`);
  }
  if (element.visible !== undefined && typeof element.visible !== 'boolean') {
    addIssue(issues, 'error', file, `${elementLabel}.visible must be a boolean`);
  }
  if (element.text !== undefined && typeof element.text !== 'string') {
    addIssue(issues, 'error', file, `${elementLabel}.text must be a string`);
  }
  if (element.src !== undefined) {
    await validateAssetReference(element.src, issues, file, assetsRoot, `${elementLabel}.src`, true);
  } else if (element.type === 'image') {
    addIssue(issues, 'warning', file, `${elementLabel} is an image without src`);
  }
  if (element.sourceAsset !== undefined) {
    await validateAssetReference(element.sourceAsset, issues, file, assetsRoot, `${elementLabel}.sourceAsset`, false);
  }

  validateStyle(element.style, issues, file, contract, elementLabel);
}

async function validateLayoutFile(file, issues, contract, assetsRoot) {
  const layout = await readJson(file, issues);
  if (!layout) {
    return;
  }
  if (!isObject(layout)) {
    addIssue(issues, 'error', file, 'Layout JSON must be an object');
    return;
  }

  validateRequiredString(layout.id, issues, file, 'layout.id');
  validateRequiredString(layout.name, issues, file, 'layout.name');
  validateBaseResolution(layout.baseResolution, issues, file, contract);

  if (!Array.isArray(layout.elements)) {
    addIssue(issues, 'error', file, 'layout.elements must be an array');
    return;
  }

  const seenIds = new Set();
  for (const [index, element] of layout.elements.entries()) {
    await validateElement(element, issues, file, contract, assetsRoot, `layout.elements[${index}]`, seenIds);
  }
}

async function validateComponentFile(file, issues, contract, assetsRoot) {
  const component = await readJson(file, issues);
  if (!component) {
    return;
  }
  if (!isObject(component)) {
    addIssue(issues, 'error', file, 'Component asset JSON must be an object');
    return;
  }

  if (component.version !== contract.version) {
    addIssue(issues, 'error', file, `component.version must be ${contract.version}`);
  }
  if (component.kind !== 'component') {
    addIssue(issues, 'error', file, 'component.kind must be "component"');
  }
  validateRequiredString(component.name, issues, file, 'component.name');
  await validateElement(component.element, issues, file, contract, assetsRoot, 'component.element', null);
}

async function validateMetadataFile(file, issues, contract) {
  const metadata = await readJson(file, issues);
  if (!metadata || !isObject(metadata)) {
    return;
  }
  if (metadata.version !== undefined && metadata.version !== contract.version) {
    addIssue(issues, 'error', file, `metadata.version must be ${contract.version}`);
  }
}

async function validateProject(contract) {
  const issues = [];
  const manifestFile = path.join(projectRoot, 'project.webapp.json');
  const manifest = await readJson(manifestFile, issues);
  if (!manifest || !isObject(manifest)) {
    return issues;
  }

  if (manifest.engine !== contract.engine) {
    addIssue(issues, 'error', manifestFile, `engine must be "${contract.engine}"`);
  }
  if (manifest.version !== contract.version) {
    addIssue(issues, 'error', manifestFile, `version must be ${contract.version}`);
  }
  validateRequiredString(manifest.name, issues, manifestFile, 'name');
  validateBaseResolution(manifest.baseResolution, issues, manifestFile, contract);

  const entryLayout = validateProjectPathValue(manifest.entryLayout, issues, manifestFile, 'entryLayout');
  const assetsRootValue = validateProjectPathValue(manifest.assetsRoot, issues, manifestFile, 'assetsRoot');
  if (entryLayout && !entryLayout.endsWith('.json')) {
    addIssue(issues, 'error', manifestFile, `entryLayout must point to a JSON layout such as ${contract.defaultEntryLayout}`);
  }
  if (assetsRootValue && assetsRootValue !== contract.defaultAssetsRoot) {
    addIssue(issues, 'error', manifestFile, `assetsRoot must be "${contract.defaultAssetsRoot}" in protocol v${contract.version}`);
  }

  const entryLayoutFile = entryLayout ? path.resolve(projectRoot, entryLayout) : null;
  const assetsRoot = assetsRootValue ? path.resolve(projectRoot, assetsRootValue) : path.resolve(projectRoot, contract.defaultAssetsRoot);

  if (entryLayoutFile && !isInside(projectRoot, entryLayoutFile)) {
    addIssue(issues, 'error', manifestFile, 'entryLayout escapes the project root');
  } else if (entryLayoutFile && !(await exists(entryLayoutFile))) {
    addIssue(issues, 'error', manifestFile, `entryLayout points to missing file "${entryLayout}"`);
  }

  if (!isInside(projectRoot, assetsRoot)) {
    addIssue(issues, 'error', manifestFile, 'assetsRoot escapes the project root');
  } else if (!(await exists(assetsRoot))) {
    addIssue(issues, 'error', manifestFile, `assetsRoot directory "${assetsRootValue}" does not exist`);
  }

  const layoutDir = path.join(projectRoot, 'layouts');
  const layoutFiles = new Set(
    (await walkFiles(layoutDir)).filter((file) => path.extname(file).toLowerCase() === '.json')
  );
  if (entryLayoutFile) {
    layoutFiles.add(entryLayoutFile);
  }

  for (const file of layoutFiles) {
    await validateLayoutFile(file, issues, contract, assetsRoot);
  }

  const assetFiles = await walkFiles(assetsRoot);
  for (const file of assetFiles) {
    if (file.endsWith('.component.webapp.json')) {
      await validateComponentFile(file, issues, contract, assetsRoot);
    } else if (file.endsWith('.webapp.json')) {
      await validateMetadataFile(file, issues, contract);
    }
  }

  return issues;
}

const contract = await readContract();
const issues = await validateProject(contract);
const errors = issues.filter((issue) => issue.severity === 'error');
const warnings = issues.filter((issue) => issue.severity === 'warning');

for (const issue of issues) {
  const output = `${issue.severity.toUpperCase()} ${issue.file}: ${issue.message}`;
  if (issue.severity === 'error') {
    console.error(output);
  } else {
    console.warn(output);
  }
}

if (errors.length > 0) {
  console.error(`Project validation failed: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exitCode = 1;
} else {
  console.log(`Project valid: ${path.relative(process.cwd(), projectRoot) || projectRoot}`);
  if (warnings.length > 0) {
    console.log(`${warnings.length} warning(s)`);
  }
}
