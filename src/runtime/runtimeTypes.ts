import { BASE_RESOLUTION, type ElementType, type ImageFit, type TextAlign } from '../shared/schema/projectContract';

export { BASE_RESOLUTION };
export type { ElementType };

export type WebAppProject = {
  engine: 'webapp-editor';
  version: number;
  name: string;
  baseResolution: {
    width: number;
    height: number;
  };
  entryLayout: string;
  assetsRoot: string;
};

export type RuntimeStyle = {
  fill?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: TextAlign;
  fit?: ImageFit;
};

export type RuntimeScriptBinding = {
  id: string;
  name: string;
  path?: string;
  enabled?: boolean;
};

export type RuntimeElement = {
  id: string;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  visible?: boolean;
  layerGroup?: string;
  layerOrder?: number;
  orderInLayer?: number;
  text?: string;
  src?: string;
  sourceAsset?: string;
  style?: RuntimeStyle;
  scripts?: RuntimeScriptBinding[];
};

export type WebAppLayout = {
  id: string;
  name: string;
  baseResolution: {
    width: number;
    height: number;
  };
  elements: RuntimeElement[];
};

export type ProjectAsset = {
  name: string;
  path: string;
  assetPath?: string;
  url: string;
  size: number;
  naturalWidth?: number;
  naturalHeight?: number;
  kind: 'folder' | 'layout' | 'image' | 'audio' | 'effect' | 'component' | 'script' | 'data' | 'unknown';
};
