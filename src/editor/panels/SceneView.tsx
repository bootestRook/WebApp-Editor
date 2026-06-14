import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type WheelEvent } from 'react';
import { Grid3X3, Magnet, MousePointer2 } from 'lucide-react';
import { RuntimeRenderer } from '../../runtime/RuntimeRenderer';
import type { RuntimeElement } from '../../runtime/runtimeTypes';
import { useEditorStore } from '../store/editorStore';
import { GridOverlay } from '../tools/GridOverlay';
import { MoveableControls, type DragChangeOptions, type DragMode } from '../tools/MoveableControls';
import { ResolutionSelector } from '../tools/ResolutionSelector';
import {
  BUILTIN_RESOLUTION_PRESETS,
  createResolutionPresetFromSize,
  type ResolutionPreset
} from '../tools/resolutionPresets';
import { useViewportScale } from '../tools/useViewportScale';
import { loadAssetDefaults, loadComponentAsset } from '../services/projectService';

const RESOLUTION_STORAGE_KEY = 'webapp-editor:active-resolution:v2';
const EDGE_SNAP_STORAGE_KEY = 'webapp-editor:edge-snap:v1';
const GRID_SNAP_STORAGE_KEY = 'webapp-editor:grid-snap:v1';
const SNAP_THRESHOLD = 8;
const GRID_SIZE = 40;

type ElementPatch = Pick<RuntimeElement, 'x' | 'y' | 'width' | 'height'>;
type AlignmentGuide = {
  axis: 'x' | 'y';
  position: number;
  from: number;
  to: number;
};

type SnapAnchor = {
  position: number;
  source?: RuntimeElement;
};

type PanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffsetX: number;
  startOffsetY: number;
};

type SelectionTransformBaseline = {
  bounds: ElementPatch;
  elements: RuntimeElement[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getSelectionBounds(elements: RuntimeElement[]): RuntimeElement | null {
  if (elements.length === 0) {
    return null;
  }

  const left = Math.min(...elements.map((element) => element.x));
  const top = Math.min(...elements.map((element) => element.y));
  const right = Math.max(...elements.map((element) => element.x + element.width));
  const bottom = Math.max(...elements.map((element) => element.y + element.height));

  return {
    id: '__selection_bounds',
    type: 'panel',
    name: 'Selection Bounds',
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top))
  };
}

function getAssetName(path: string) {
  return path.split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? 'Asset';
}

function getLayoutDisplayName(path: string | null, fallbackName?: string) {
  const fileName = path?.split('/').at(-1) ?? fallbackName ?? 'Untitled';
  return fileName.replace(/\.layout\.json$/i, '').replace(/\.[^.]+$/i, '');
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

function loadEdgeSnapEnabled() {
  return window.localStorage.getItem(EDGE_SNAP_STORAGE_KEY) === 'true';
}

function saveEdgeSnapEnabled(enabled: boolean) {
  window.localStorage.setItem(EDGE_SNAP_STORAGE_KEY, String(enabled));
}

function loadGridSnapEnabled() {
  return window.localStorage.getItem(GRID_SNAP_STORAGE_KEY) === 'true';
}

function saveGridSnapEnabled(enabled: boolean) {
  window.localStorage.setItem(GRID_SNAP_STORAGE_KEY, String(enabled));
}

function getHorizontalRange(patch: ElementPatch, source?: RuntimeElement) {
  const sourceLeft = source?.x ?? patch.x;
  const sourceRight = source ? source.x + source.width : patch.x + patch.width;
  return {
    from: Math.max(0, Math.round(Math.min(patch.x, sourceLeft))),
    to: Math.round(Math.max(patch.x + patch.width, sourceRight))
  };
}

function getVerticalRange(patch: ElementPatch, source?: RuntimeElement) {
  const sourceTop = source?.y ?? patch.y;
  const sourceBottom = source ? source.y + source.height : patch.y + patch.height;
  return {
    from: Math.max(0, Math.round(Math.min(patch.y, sourceTop))),
    to: Math.round(Math.max(patch.y + patch.height, sourceBottom))
  };
}

function findNearestSnap(activePositions: number[], candidates: SnapAnchor[]) {
  let best: { offset: number; candidate: SnapAnchor } | null = null;

  for (const activePosition of activePositions) {
    for (const candidate of candidates) {
      const offset = candidate.position - activePosition;
      if (Math.abs(offset) > SNAP_THRESHOLD) {
        continue;
      }

      if (!best || Math.abs(offset) < Math.abs(best.offset)) {
        best = { offset, candidate };
      }
    }
  }

  return best;
}

function getNearestGridLine(position: number, resolutionLimit: number) {
  return clamp(Math.round(position / GRID_SIZE) * GRID_SIZE, 0, resolutionLimit);
}

function findNearestGridSnap(activePositions: number[], resolutionLimit: number) {
  let best: { offset: number; position: number } | null = null;

  for (const activePosition of activePositions) {
    const position = getNearestGridLine(activePosition, resolutionLimit);
    const offset = position - activePosition;
    if (Math.abs(offset) > SNAP_THRESHOLD) {
      continue;
    }

    if (!best || Math.abs(offset) < Math.abs(best.offset)) {
      best = { offset, position };
    }
  }

  return best;
}

function getGridSnappedPatch(
  patch: ElementPatch,
  mode: DragMode,
  options: DragChangeOptions,
  resolution: ResolutionPreset
) {
  const next = { ...patch };
  const guides: AlignmentGuide[] = [];
  const activeXPositions = mode === 'resize' ? [patch.x + patch.width] : [patch.x, patch.x + patch.width];
  const activeYPositions = mode === 'resize' ? [patch.y + patch.height] : [patch.y, patch.y + patch.height];
  const xSnap = findNearestGridSnap(activeXPositions, resolution.width);
  const ySnap = findNearestGridSnap(activeYPositions, resolution.height);

  if (mode === 'resize' && options.constrainProportions && (xSnap || ySnap)) {
    const aspectRatio = patch.width / patch.height || 1;
    const useXSnap = Boolean(xSnap && (!ySnap || Math.abs(xSnap.offset) <= Math.abs(ySnap.offset)));

    if (useXSnap && xSnap) {
      next.width = Math.max(8, Math.round(patch.width + xSnap.offset));
      next.height = Math.max(8, Math.round(next.width / aspectRatio));
      guides.push({ axis: 'x', position: Math.round(xSnap.position), from: 0, to: resolution.height });
    } else if (ySnap) {
      next.height = Math.max(8, Math.round(patch.height + ySnap.offset));
      next.width = Math.max(8, Math.round(next.height * aspectRatio));
      guides.push({ axis: 'y', position: Math.round(ySnap.position), from: 0, to: resolution.width });
    }

    return { patch: next, guides };
  }

  if (xSnap) {
    if (mode === 'resize') {
      next.width = Math.max(8, Math.round(patch.width + xSnap.offset));
    } else {
      next.x = Math.round(patch.x + xSnap.offset);
    }
    guides.push({ axis: 'x', position: Math.round(xSnap.position), from: 0, to: resolution.height });
  }

  if (ySnap) {
    if (mode === 'resize') {
      next.height = Math.max(8, Math.round(patch.height + ySnap.offset));
    } else {
      next.y = Math.round(patch.y + ySnap.offset);
    }
    guides.push({ axis: 'y', position: Math.round(ySnap.position), from: 0, to: resolution.width });
  }

  return { patch: next, guides };
}

function getSnappedPatch(
  patch: ElementPatch,
  mode: DragMode,
  options: DragChangeOptions,
  selectedIds: string[],
  elements: RuntimeElement[],
  resolution: ResolutionPreset
) {
  const excludedIds = new Set(selectedIds);
  const visibleOtherElements = elements.filter((element) => element.visible !== false && !excludedIds.has(element.id));
  const xCandidates: SnapAnchor[] = [
    { position: 0 },
    { position: resolution.width / 2 },
    { position: resolution.width },
    ...visibleOtherElements.flatMap((element) => [
      { position: element.x, source: element },
      { position: element.x + element.width / 2, source: element },
      { position: element.x + element.width, source: element }
    ])
  ];
  const yCandidates: SnapAnchor[] = [
    { position: 0 },
    { position: resolution.height / 2 },
    { position: resolution.height },
    ...visibleOtherElements.flatMap((element) => [
      { position: element.y, source: element },
      { position: element.y + element.height / 2, source: element },
      { position: element.y + element.height, source: element }
    ])
  ];
  const next = { ...patch };
  const guides: AlignmentGuide[] = [];
  const activeXPositions =
    mode === 'resize' ? [patch.x + patch.width] : [patch.x, patch.x + patch.width / 2, patch.x + patch.width];
  const activeYPositions =
    mode === 'resize' ? [patch.y + patch.height] : [patch.y, patch.y + patch.height / 2, patch.y + patch.height];
  const xSnap = findNearestSnap(activeXPositions, xCandidates);
  const ySnap = findNearestSnap(activeYPositions, yCandidates);

  if (mode === 'resize' && options.constrainProportions && (xSnap || ySnap)) {
    const aspectRatio = patch.width / patch.height || 1;
    const useXSnap = Boolean(xSnap && (!ySnap || Math.abs(xSnap.offset) <= Math.abs(ySnap.offset)));

    if (useXSnap && xSnap) {
      next.width = Math.max(8, Math.round(patch.width + xSnap.offset));
      next.height = Math.max(8, Math.round(next.width / aspectRatio));
      const range = getVerticalRange(next, xSnap.candidate.source);
      guides.push({
        axis: 'x',
        position: Math.round(xSnap.candidate.position),
        from: range.from,
        to: Math.min(resolution.height, range.to)
      });
    } else if (ySnap) {
      next.height = Math.max(8, Math.round(patch.height + ySnap.offset));
      next.width = Math.max(8, Math.round(next.height * aspectRatio));
      const range = getHorizontalRange(next, ySnap.candidate.source);
      guides.push({
        axis: 'y',
        position: Math.round(ySnap.candidate.position),
        from: range.from,
        to: Math.min(resolution.width, range.to)
      });
    }

    return {
      patch: next,
      guides
    };
  }

  if (xSnap) {
    if (mode === 'resize') {
      next.width = Math.max(8, Math.round(patch.width + xSnap.offset));
    } else {
      next.x = Math.round(patch.x + xSnap.offset);
    }
    const range = getVerticalRange(next, xSnap.candidate.source);
    guides.push({
      axis: 'x',
      position: Math.round(xSnap.candidate.position),
      from: range.from,
      to: Math.min(resolution.height, range.to)
    });
  }

  if (ySnap) {
    if (mode === 'resize') {
      next.height = Math.max(8, Math.round(patch.height + ySnap.offset));
    } else {
      next.y = Math.round(patch.y + ySnap.offset);
    }
    const range = getHorizontalRange(next, ySnap.candidate.source);
    guides.push({
      axis: 'y',
      position: Math.round(ySnap.candidate.position),
      from: range.from,
      to: Math.min(resolution.width, range.to)
    });
  }

  return {
    patch: next,
    guides
  };
}

export function SceneView() {
  const { state, selectedElement, selectedElements, dispatch } = useEditorStore();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<PanState | null>(null);
  const selectionTransformRef = useRef<SelectionTransformBaseline | null>(null);
  const [resolution, setResolution] = useState<ResolutionPreset>(() => loadActiveResolution());
  const [edgeSnapEnabled, setEdgeSnapEnabled] = useState(() => loadEdgeSnapEnabled());
  const [gridSnapEnabled, setGridSnapEnabled] = useState(() => loadGridSnapEnabled());
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const fitScale = useViewportScale(viewportRef, 28, 28, 0.35, resolution.width, resolution.height);
  const [zoomMultiplier, setZoomMultiplier] = useState(1);
  const scale = clamp(fitScale * zoomMultiplier, 0.03, 4);
  const layoutDisplayName = getLayoutDisplayName(state.activeLayoutPath, state.layout?.name);

  useEffect(() => {
    if (!state.project) {
      return;
    }

    const projectResolution = createResolutionPresetFromSize(
      state.project.baseResolution.width,
      state.project.baseResolution.height
    );
    setResolution(projectResolution);
    saveActiveResolution(projectResolution);
  }, [state.project?.baseResolution.height, state.project?.baseResolution.width]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    setZoomMultiplier((current) => clamp(current * zoomFactor, 0.2, 16));
  };

  const handleResolutionChange = (preset: ResolutionPreset) => {
    setResolution(preset);
    saveActiveResolution(preset);
  };

  const toggleEdgeSnap = () => {
    setEdgeSnapEnabled((current) => {
      const next = !current;
      saveEdgeSnapEnabled(next);
      if (!next) {
        setAlignmentGuides([]);
      }
      return next;
    });
  };

  const toggleGridSnap = () => {
    setGridSnapEnabled((current) => {
      const next = !current;
      saveGridSnapEnabled(next);
      if (!next) {
        setAlignmentGuides([]);
      }
      return next;
    });
  };

  const handleViewportPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button === 1) {
      return;
    }

    const target = event.target as HTMLElement;
    if (!target.closest('.runtime-element') && !target.closest('.moveable-frame')) {
      dispatch({ type: 'select', id: null });
    }
  };

  const beginCanvasPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: panOffset.x,
      startOffsetY: panOffset.y
    };
    setIsPanning(true);
  };

  const updateCanvasPan = (event: PointerEvent<HTMLDivElement>) => {
    if (!panRef.current || panRef.current.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    setPanOffset({
      x: Math.round(panRef.current.startOffsetX + event.clientX - panRef.current.startClientX),
      y: Math.round(panRef.current.startOffsetY + event.clientY - panRef.current.startClientY)
    });
  };

  const endCanvasPan = (event: PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) {
      return;
    }

    panRef.current = null;
    setIsPanning(false);
  };

  const handleAssetDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('application/webapp-asset')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleAssetDrop = async (event: DragEvent<HTMLDivElement>) => {
    const raw = event.dataTransfer.getData('application/webapp-asset');
    if (!raw || !state.layout) {
      return;
    }

    event.preventDefault();
    const payload = JSON.parse(raw) as {
      asset?: {
        path: string;
        assetPath?: string;
        kind: string;
        naturalWidth?: number;
        naturalHeight?: number;
      };
    };
    const asset = payload.asset;
    if (!asset || (asset.kind !== 'image' && asset.kind !== 'component')) {
      dispatch({ type: 'log', message: 'Only image and component assets can be dropped into SceneView' });
      return;
    }
    const sourcePath = asset.assetPath ?? asset.path;

    const surface = event.currentTarget.querySelector('.scaled-surface')?.getBoundingClientRect();
    if (!surface) {
      return;
    }

    if (asset.kind === 'component') {
      try {
        const componentElement = await loadComponentAsset(sourcePath);
        const width = Math.max(1, Math.round(componentElement.width));
        const height = Math.max(1, Math.round(componentElement.height));
        const x = Math.round((event.clientX - surface.x) / scale - width / 2);
        const y = Math.round((event.clientY - surface.y) / scale - height / 2);
        const id = `component_${Date.now()}`;

        dispatch({
          type: 'add-element',
          element: {
            ...componentElement,
            id,
            name: componentElement.name,
            x,
            y,
            width,
            height,
            sourceAsset: sourcePath
          }
        });
        return;
      } catch (error) {
        dispatch({
          type: 'log',
          message: error instanceof Error ? error.message : `Failed to load component asset ${sourcePath}`
        });
        return;
      }
    }

    const defaultWidth = asset.naturalWidth ?? 256;
    const defaultHeight = asset.naturalHeight ?? 256;
    let defaults: Partial<RuntimeElement> | null = null;
    try {
      defaults = await loadAssetDefaults(sourcePath);
    } catch (error) {
      dispatch({
        type: 'log',
        message: error instanceof Error ? error.message : `Failed to load defaults for ${sourcePath}`
      });
    }

    const width = Math.max(1, Math.round(defaults?.width ?? defaultWidth));
    const height = Math.max(1, Math.round(defaults?.height ?? defaultHeight));
    const x = Math.round((event.clientX - surface.x) / scale - width / 2);
    const y = Math.round((event.clientY - surface.y) / scale - height / 2);
    const id = `asset_${Date.now()}`;

    dispatch({
      type: 'add-element',
      element: {
        ...defaults,
        id,
        type: 'image',
        name: getAssetName(sourcePath),
        x,
        y,
        width,
        height,
        src: sourcePath,
        sourceAsset: sourcePath,
        style: {
          ...(defaults?.style ?? {}),
          fit: defaults?.style?.fit ?? 'fill'
        }
      }
    });
  };
  const orderedIds = state.layout?.elements.map((element) => element.id) ?? [];
  const visibleSelectedElements = useMemo(
    () => selectedElements.filter((element) => element.visible !== false),
    [selectedElements]
  );
  const selectionBounds = useMemo(() => getSelectionBounds(visibleSelectedElements), [visibleSelectedElements]);
  const controlElement =
    visibleSelectedElements.length > 1
      ? selectionBounds
      : selectedElement?.visible === false
        ? null
        : selectedElement;

  const handleSceneSelect = (id: string | null, event: PointerEvent<HTMLDivElement>) => {
    if (!id) {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
        dispatch({ type: 'select', id: null });
      }
      return;
    }

    if (event.shiftKey) {
      dispatch({ type: 'select', id, mode: 'range', orderedIds });
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      dispatch({ type: 'select', id, mode: 'toggle' });
      return;
    }

    dispatch({ type: 'select', id });
  };

  const beginSelectionTransform = (mode: DragMode) => {
    setAlignmentGuides([]);
    selectionTransformRef.current = controlElement
      ? {
          bounds: {
            x: controlElement.x,
            y: controlElement.y,
            width: controlElement.width,
            height: controlElement.height
          },
          elements: visibleSelectedElements.map((element) => ({ ...element }))
        }
      : null;
    dispatch({ type: 'begin-history-group', label: mode === 'resize' ? 'Resize Selection' : 'Move Selection' });
  };

  const endSelectionTransform = () => {
    selectionTransformRef.current = null;
    setAlignmentGuides([]);
    dispatch({ type: 'end-history-group' });
  };

  const updateSelectedElements = (patch: ElementPatch, mode: DragMode, options: DragChangeOptions) => {
    if (!controlElement) {
      return;
    }

    const edgeSnapResult =
      edgeSnapEnabled && state.layout
        ? getSnappedPatch(
            patch,
            mode,
            options,
            visibleSelectedElements.map((element) => element.id),
            state.layout.elements,
            resolution
          )
        : { patch, guides: [] };
    const gridSnapResult = gridSnapEnabled
      ? getGridSnappedPatch(edgeSnapResult.patch, mode, options, resolution)
      : { patch: edgeSnapResult.patch, guides: [] };
    const nextPatch = gridSnapResult.patch;
    setAlignmentGuides([...edgeSnapResult.guides, ...gridSnapResult.guides]);

    if (visibleSelectedElements.length <= 1 && selectedElement) {
      dispatch({ type: 'update-element', id: selectedElement.id, patch: nextPatch });
      return;
    }

    const baseline = selectionTransformRef.current;
    const sourceBounds = baseline?.bounds ?? controlElement;
    const sourceElements = baseline?.elements ?? visibleSelectedElements;
    const scaleX = sourceBounds.width === 0 ? 1 : nextPatch.width / sourceBounds.width;
    const scaleY = sourceBounds.height === 0 ? 1 : nextPatch.height / sourceBounds.height;

    for (const element of sourceElements) {
      dispatch({
        type: 'update-element',
        id: element.id,
        patch: {
          x: Math.round(nextPatch.x + (element.x - sourceBounds.x) * scaleX),
          y: Math.round(nextPatch.y + (element.y - sourceBounds.y) * scaleY),
          width: Math.max(1, Math.round(element.width * scaleX)),
          height: Math.max(1, Math.round(element.height * scaleY))
        }
      });
    }
  };

  return (
    <section className="panel view-panel scene-view">
      <div className="panel-title">
        <MousePointer2 size={16} />
        <span>SceneView</span>
        <span className="open-layout-name" title={state.activeLayoutPath ?? state.layout?.name ?? ''}>
          {layoutDisplayName}
        </span>
        <button
          type="button"
          className={`scene-toggle-button scene-icon-toggle ${edgeSnapEnabled ? 'is-active' : ''}`}
          title="移动或缩放组件时显示边缘对齐线并吸附"
          onClick={toggleEdgeSnap}
        >
          <Magnet size={14} />
          边缘对齐
        </button>
        <button
          type="button"
          className={`scene-toggle-button scene-icon-toggle ${gridSnapEnabled ? 'is-active' : ''}`}
          title="移动或缩放组件时，让组件边缘吸附到最近的网格线"
          onClick={toggleGridSnap}
        >
          <Grid3X3 size={14} />
          与网格对齐
        </button>
        <ResolutionSelector value={resolution} onChange={handleResolutionChange} />
        <small>@ {Math.round(scale * 100)}%</small>
      </div>
      <div
        className={`view-viewport ${isPanning ? 'is-panning' : ''}`}
        ref={viewportRef}
        onDragOver={handleAssetDragOver}
        onDrop={handleAssetDrop}
        onAuxClick={(event) => event.preventDefault()}
        onPointerDown={handleViewportPointerDown}
        onPointerDownCapture={beginCanvasPan}
        onPointerMove={updateCanvasPan}
        onPointerUp={endCanvasPan}
        onPointerCancel={endCanvasPan}
        onWheel={handleWheel}
      >
        {state.layout ? (
          <div
            className="scaled-surface"
            style={{
              left: `calc(50% + ${panOffset.x}px)`,
              top: `calc(50% + ${panOffset.y}px)`,
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
                interactive
                assetBaseUrl="/__webapp_editor/assets"
                layout={state.layout}
                selectedElementId={state.selectedElementId}
                selectedElementIds={state.selectedElementIds}
                viewportWidth={resolution.width}
                viewportHeight={resolution.height}
                onSelect={handleSceneSelect}
              >
                <GridOverlay width={resolution.width} height={resolution.height} />
                {alignmentGuides.map((guide, index) => (
                  <div
                    key={`${guide.axis}-${guide.position}-${index}`}
                    className={`alignment-guide alignment-guide-${guide.axis}`}
                    style={
                      guide.axis === 'x'
                        ? { left: guide.position, top: guide.from, height: Math.max(1, guide.to - guide.from) }
                        : { top: guide.position, left: guide.from, width: Math.max(1, guide.to - guide.from) }
                    }
                  />
                ))}
                {controlElement ? (
                  <MoveableControls
                    element={controlElement}
                    scale={scale}
                    onChange={updateSelectedElements}
                    onBeginChange={beginSelectionTransform}
                    onEndChange={endSelectionTransform}
                  />
                ) : null}
              </RuntimeRenderer>
            </div>
          </div>
        ) : (
          <div className="empty-state">Loading layout</div>
        )}
      </div>
    </section>
  );
}
