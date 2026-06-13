import { useRef, useState, type WheelEvent } from 'react';
import { Monitor } from 'lucide-react';
import { RuntimeRenderer } from '../../runtime/RuntimeRenderer';
import { useEditorStore } from '../store/editorStore';
import { ResolutionSelector } from '../tools/ResolutionSelector';
import { BUILTIN_RESOLUTION_PRESETS, type ResolutionPreset } from '../tools/resolutionPresets';
import { useViewportScale } from '../tools/useViewportScale';

const RESOLUTION_STORAGE_KEY = 'webapp-editor:active-resolution:v1';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function loadActiveResolution() {
  try {
    const raw = window.localStorage.getItem(RESOLUTION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ResolutionPreset) : BUILTIN_RESOLUTION_PRESETS[0];
  } catch {
    return BUILTIN_RESOLUTION_PRESETS[0];
  }
}

function saveActiveResolution(preset: ResolutionPreset) {
  window.localStorage.setItem(RESOLUTION_STORAGE_KEY, JSON.stringify(preset));
}

export function GameView() {
  const { state } = useEditorStore();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [resolution, setResolution] = useState<ResolutionPreset>(() => loadActiveResolution());
  const fitScale = useViewportScale(stageRef, 24, 24, 0.25, resolution.width, resolution.height);
  const [zoomMultiplier, setZoomMultiplier] = useState(1);
  const scale = clamp(fitScale * zoomMultiplier, 0.03, 4);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    setZoomMultiplier((current) => clamp(current * zoomFactor, 0.2, 16));
  };

  const handleResolutionChange = (preset: ResolutionPreset) => {
    setResolution(preset);
    saveActiveResolution(preset);
  };

  return (
    <section className="panel view-panel game-view">
      <div className="panel-title">
        <Monitor size={16} />
        <span>GameView</span>
        <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
        <small>@ {Math.round(scale * 100)}%</small>
      </div>
      <div className="game-stage" ref={stageRef} onWheel={handleWheel}>
        {state.layout ? (
          <div
            className="scaled-surface game-surface"
            style={{
              width: resolution.width * scale,
              height: resolution.height * scale
            }}
          >
            <div
              className="scaled-canvas"
              style={{
                width: resolution.width,
                height: resolution.height,
                transform: `scale(${scale})`
              }}
            >
              <RuntimeRenderer
                assetBaseUrl="/__webapp_editor/assets"
                layout={state.layout}
                viewportWidth={resolution.width}
                viewportHeight={resolution.height}
              />
            </div>
          </div>
        ) : (
          <div className="empty-state">Loading layout</div>
        )}
      </div>
    </section>
  );
}
