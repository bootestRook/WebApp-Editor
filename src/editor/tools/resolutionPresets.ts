export type ResolutionPreset = {
  id: string;
  name: string;
  width: number;
  height: number;
};

export const BUILTIN_RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: 'landscape-qhd', name: 'QHD Landscape', width: 2560, height: 1440 },
  { id: 'landscape-fhd', name: 'FHD Landscape', width: 1920, height: 1080 },
  { id: 'landscape-hd', name: 'HD Landscape', width: 1280, height: 720 },
  { id: 'tablet-landscape', name: 'Tablet Landscape', width: 1366, height: 1024 },
  { id: 'mobile-landscape', name: 'Mobile Landscape', width: 2340, height: 1080 },
  { id: 'portrait-fhd', name: 'FHD Portrait', width: 1080, height: 1920 },
  { id: 'portrait-mobile', name: 'Mobile Portrait', width: 1080, height: 2340 },
  { id: 'portrait-tablet', name: 'Tablet Portrait', width: 1024, height: 1366 }
];

const STORAGE_KEY = 'webapp-editor:resolution-presets:v1';

export function loadCustomResolutionPresets() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ResolutionPreset[]) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (preset) =>
            typeof preset.id === 'string' &&
            typeof preset.name === 'string' &&
            Number.isFinite(preset.width) &&
            Number.isFinite(preset.height)
        )
      : [];
  } catch {
    return [];
  }
}

export function saveCustomResolutionPreset(preset: Omit<ResolutionPreset, 'id'>) {
  const current = loadCustomResolutionPresets();
  const nextPreset: ResolutionPreset = {
    ...preset,
    id: `custom-${Date.now()}`
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, nextPreset]));
  return nextPreset;
}
