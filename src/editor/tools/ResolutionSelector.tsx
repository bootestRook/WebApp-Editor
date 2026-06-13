import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  BUILTIN_RESOLUTION_PRESETS,
  loadCustomResolutionPresets,
  saveCustomResolutionPreset,
  type ResolutionPreset
} from './resolutionPresets';

type Props = {
  value: ResolutionPreset;
  onChange: (preset: ResolutionPreset) => void;
};

function toPositiveInt(value: string) {
  return Math.max(1, Math.round(Number(value) || 1));
}

export function ResolutionSelector({ value, onChange }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [customPresets, setCustomPresets] = useState<ResolutionPreset[]>(() => loadCustomResolutionPresets());
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('Custom');
  const [customWidth, setCustomWidth] = useState(String(value.width));
  const [customHeight, setCustomHeight] = useState(String(value.height));
  const presets = useMemo(() => [...BUILTIN_RESOLUTION_PRESETS, ...customPresets], [customPresets]);

  useEffect(() => {
    if (!showCustomForm) {
      return undefined;
    }

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setShowCustomForm(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowCustomForm(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showCustomForm]);

  const handleSelect = (id: string) => {
    if (id === '__custom') {
      setShowCustomForm(true);
      setCustomWidth(String(value.width));
      setCustomHeight(String(value.height));
      return;
    }

    const preset = presets.find((item) => item.id === id);
    if (preset) {
      onChange(preset);
    }
  };

  const saveCustom = () => {
    const preset = saveCustomResolutionPreset({
      name: customName.trim() || `${customWidth} x ${customHeight}`,
      width: toPositiveInt(customWidth),
      height: toPositiveInt(customHeight)
    });
    setCustomPresets((current) => [...current, preset]);
    onChange(preset);
    setShowCustomForm(false);
  };

  return (
    <div className="resolution-selector" ref={rootRef} onPointerDown={(event) => event.stopPropagation()}>
      <select
        aria-label="Resolution preset"
        value={presets.some((preset) => preset.id === value.id) ? value.id : ''}
        onChange={(event) => handleSelect(event.target.value)}
      >
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name} ({preset.width} x {preset.height})
          </option>
        ))}
        <option value="__custom">Add custom...</option>
      </select>
      <span>@ {Math.round(value.width)} x {Math.round(value.height)}</span>
      {showCustomForm ? (
        <div className="resolution-popover">
          <button
            type="button"
            className="resolution-popover-close"
            aria-label="Close custom resolution form"
            onClick={() => setShowCustomForm(false)}
          >
            <X size={14} />
          </button>
          <label>
            Name
            <input value={customName} onChange={(event) => setCustomName(event.target.value)} />
          </label>
          <label>
            W
            <input type="number" min={1} value={customWidth} onChange={(event) => setCustomWidth(event.target.value)} />
          </label>
          <label>
            H
            <input type="number" min={1} value={customHeight} onChange={(event) => setCustomHeight(event.target.value)} />
          </label>
          <button type="button" onClick={saveCustom}>
            <Plus size={14} />
            Save
          </button>
        </div>
      ) : null}
    </div>
  );
}
