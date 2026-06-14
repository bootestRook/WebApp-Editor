export const WEBAPP_ENGINE = 'webapp-editor' as const;
export const WEBAPP_PROJECT_VERSION = 1;

export const BASE_RESOLUTION = {
  width: 1920,
  height: 1080
} as const;

export const SUPPORTED_BASE_RESOLUTIONS = [
  BASE_RESOLUTION,
  { width: 2560, height: 1440 },
  { width: 1280, height: 720 },
  { width: 1366, height: 1024 },
  { width: 2340, height: 1080 },
  { width: 1080, height: 1920 },
  { width: 1080, height: 2340 },
  { width: 1024, height: 1366 }
] as const;

export type BaseResolution = {
  width: number;
  height: number;
};

export function isSupportedBaseResolution(resolution: BaseResolution) {
  return SUPPORTED_BASE_RESOLUTIONS.some(
    (item) => item.width === resolution.width && item.height === resolution.height
  );
}

export function formatSupportedBaseResolutions() {
  return SUPPORTED_BASE_RESOLUTIONS.map((item) => `${item.width}x${item.height}`).join(', ');
}

export const ELEMENT_TYPES = ['panel', 'text', 'button', 'image'] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const DEFAULT_ROTATION = 0;

export const TEXT_ALIGN_VALUES = ['left', 'center', 'right'] as const;
export type TextAlign = (typeof TEXT_ALIGN_VALUES)[number];

export const IMAGE_FIT_VALUES = ['cover', 'contain', 'fill'] as const;
export type ImageFit = (typeof IMAGE_FIT_VALUES)[number];

export const PROJECT_FILE_NAME = 'project.webapp.json' as const;
export const DEFAULT_ENTRY_LAYOUT = 'layouts/main_page.layout.json' as const;
export const DEFAULT_ASSETS_ROOT = 'assets' as const;
