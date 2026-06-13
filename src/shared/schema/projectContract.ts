export const WEBAPP_ENGINE = 'webapp-editor' as const;
export const WEBAPP_PROJECT_VERSION = 1;

export const BASE_RESOLUTION = {
  width: 2560,
  height: 1440
} as const;

export const ELEMENT_TYPES = ['panel', 'text', 'button', 'image'] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const TEXT_ALIGN_VALUES = ['left', 'center', 'right'] as const;
export type TextAlign = (typeof TEXT_ALIGN_VALUES)[number];

export const IMAGE_FIT_VALUES = ['cover', 'contain', 'fill'] as const;
export type ImageFit = (typeof IMAGE_FIT_VALUES)[number];

export const PROJECT_FILE_NAME = 'project.webapp.json' as const;
export const DEFAULT_ENTRY_LAYOUT = 'layouts/main_page.layout.json' as const;
export const DEFAULT_ASSETS_ROOT = 'assets' as const;
