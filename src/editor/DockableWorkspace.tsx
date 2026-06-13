import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { loadEditorDockLayout, saveEditorDockLayout } from './services/editorLayoutService';

type PanelId = 'hierarchy' | 'project' | 'scene' | 'game' | 'inspector' | 'console';
type SplitAxis = 'x' | 'y';
type DropZone = 'left' | 'right' | 'top' | 'bottom';

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LeafNode = {
  type: 'leaf';
  panelId: PanelId;
};

type SplitNode = {
  type: 'split';
  axis: SplitAxis;
  ratio: number;
  first: DockNode;
  second: DockNode;
};

type DockNode = LeafNode | SplitNode;

type LeafPlacement = {
  path: string;
  panelId: PanelId;
  rect: Rect;
};

type SplitterPlacement = {
  path: string;
  axis: SplitAxis;
  rect: Rect;
  hitRect: Rect;
  splitRect: Rect;
  ratio: number;
};

type DragPanelState = {
  panelId: PanelId;
  fromPath: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type DropTarget = {
  panelId: PanelId;
  zone: DropZone;
  rect: Rect;
};

type ResizeState = {
  pointerId: number;
  path: string;
  axis: SplitAxis;
  startClientX: number;
  startClientY: number;
  startRatio: number;
  splitRect: Rect;
};

type StoredDockLayout = {
  version: 2;
  tree: DockNode;
};

type CustomDockLayoutPreset = {
  id: string;
  name: string;
  tree: DockNode;
  updatedAt: number;
};

export type EditorLayoutPresetRequest = {
  requestId: number;
  presetId: string;
};

export type EditorLayoutPresetSaveRequest = {
  requestId: number;
  presetId: string;
  name: string;
};

const SPLITTER_SIZE = 6;
const SPLITTER_HIT_SIZE = 18;
const STORAGE_KEY = 'webapp-editor:dock-layout:v2';
const CUSTOM_PRESETS_STORAGE_KEY = 'webapp-editor:dock-layout-custom-presets:v1';
const panelIds: PanelId[] = ['hierarchy', 'project', 'scene', 'game', 'inspector', 'console'];
const MIN_LEAF_WIDTH = 180;
const MIN_LEAF_HEIGHT = 130;

const defaultDockTree: DockNode = {
  type: 'split',
  axis: 'x',
  ratio: 0.13,
  first: {
    type: 'split',
    axis: 'y',
    ratio: 0.78,
    first: { type: 'leaf', panelId: 'hierarchy' },
    second: { type: 'leaf', panelId: 'project' }
  },
  second: {
    type: 'split',
    axis: 'x',
    ratio: 0.8,
    first: {
      type: 'split',
      axis: 'y',
      ratio: 0.62,
      first: { type: 'leaf', panelId: 'scene' },
      second: { type: 'leaf', panelId: 'game' }
    },
    second: {
      type: 'split',
      axis: 'y',
      ratio: 0.62,
      first: { type: 'leaf', panelId: 'inspector' },
      second: { type: 'leaf', panelId: 'console' }
    }
  }
};

const builtinDockLayoutPresets: Array<{ id: string; name: string; tree: DockNode }> = [
  {
    id: 'default',
    name: '默认布局',
    tree: defaultDockTree
  },
  {
    id: 'wide-edit',
    name: '宽屏编辑',
    tree: {
      type: 'split',
      axis: 'x',
      ratio: 0.16,
      first: {
        type: 'split',
        axis: 'y',
        ratio: 0.68,
        first: { type: 'leaf', panelId: 'hierarchy' },
        second: { type: 'leaf', panelId: 'project' }
      },
      second: {
        type: 'split',
        axis: 'x',
        ratio: 0.74,
        first: {
          type: 'split',
          axis: 'y',
          ratio: 0.74,
          first: { type: 'leaf', panelId: 'scene' },
          second: { type: 'leaf', panelId: 'game' }
        },
        second: {
          type: 'split',
          axis: 'y',
          ratio: 0.7,
          first: { type: 'leaf', panelId: 'inspector' },
          second: { type: 'leaf', panelId: 'console' }
        }
      }
    }
  },
  {
    id: 'debug-preview',
    name: '调试预览',
    tree: {
      type: 'split',
      axis: 'x',
      ratio: 0.18,
      first: {
        type: 'split',
        axis: 'y',
        ratio: 0.5,
        first: { type: 'leaf', panelId: 'hierarchy' },
        second: { type: 'leaf', panelId: 'project' }
      },
      second: {
        type: 'split',
        axis: 'y',
        ratio: 0.7,
        first: {
          type: 'split',
          axis: 'x',
          ratio: 0.55,
          first: { type: 'leaf', panelId: 'scene' },
          second: { type: 'leaf', panelId: 'game' }
        },
        second: {
          type: 'split',
          axis: 'x',
          ratio: 0.62,
          first: { type: 'leaf', panelId: 'console' },
          second: { type: 'leaf', panelId: 'inspector' }
        }
      }
    }
  }
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getPanelIds(node: DockNode): PanelId[] {
  if (node.type === 'leaf') {
    return [node.panelId];
  }

  return [...getPanelIds(node.first), ...getPanelIds(node.second)];
}

function isDockNode(value: unknown): value is DockNode {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const node = value as Partial<DockNode>;
  if (node.type === 'leaf') {
    return panelIds.includes(node.panelId as PanelId);
  }

  if (node.type === 'split') {
    return (
      (node.axis === 'x' || node.axis === 'y') &&
      typeof node.ratio === 'number' &&
      Number.isFinite(node.ratio) &&
      isDockNode(node.first) &&
      isDockNode(node.second)
    );
  }

  return false;
}

function isStoredDockLayout(value: unknown): value is StoredDockLayout {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<StoredDockLayout>;
  if (candidate.version !== 2 || !isDockNode(candidate.tree)) {
    return false;
  }

  const ids = getPanelIds(candidate.tree);
  return ids.length === panelIds.length && panelIds.every((panelId) => ids.includes(panelId));
}

function loadStoredDockLayout() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    return isStoredDockLayout(parsed) ? parsed.tree : null;
  } catch {
    return null;
  }
}

function saveStoredDockLayout(tree: DockNode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, tree } satisfies StoredDockLayout));
  } catch {
    // Editor preferences are non-critical; ignore storage failures.
  }
}

function cloneDockTree(tree: DockNode) {
  return JSON.parse(JSON.stringify(tree)) as DockNode;
}

function isCustomDockLayoutPreset(value: unknown): value is CustomDockLayoutPreset {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<CustomDockLayoutPreset>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.updatedAt === 'number' &&
    isDockNode(candidate.tree)
  );
}

function loadCustomDockLayoutPresets() {
  try {
    const raw = window.localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter(isCustomDockLayoutPreset) : [];
  } catch {
    return [];
  }
}

function saveCustomDockLayoutPresets(presets: CustomDockLayoutPreset[]) {
  try {
    window.localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(presets.slice(0, 30)));
  } catch {
    // Editor preferences are non-critical; ignore storage failures.
  }
}

function getDockLayoutPreset(presetId: string) {
  const builtinPreset = builtinDockLayoutPresets.find((preset) => preset.id === presetId);
  if (builtinPreset) {
    return builtinPreset;
  }

  return loadCustomDockLayoutPresets().find((preset) => preset.id === presetId) ?? null;
}

function layoutTree(
  node: DockNode,
  rect: Rect,
  path = 'root',
  leaves: LeafPlacement[] = [],
  splitters: SplitterPlacement[] = []
) {
  if (node.type === 'leaf') {
    leaves.push({ path, panelId: node.panelId, rect });
    return { leaves, splitters };
  }

  const ratio = clamp(node.ratio, 0.12, 0.88);

  if (node.axis === 'x') {
    const availableWidth = Math.max(1, rect.width - SPLITTER_SIZE);
    const firstWidth = Math.round(availableWidth * ratio);
    const secondWidth = Math.max(1, availableWidth - firstWidth);
    const firstRect = { x: rect.x, y: rect.y, width: firstWidth, height: rect.height };
    const splitterRect = { x: rect.x + firstWidth, y: rect.y, width: SPLITTER_SIZE, height: rect.height };
    const secondRect = { x: splitterRect.x + SPLITTER_SIZE, y: rect.y, width: secondWidth, height: rect.height };

    splitters.push({
      path,
      axis: node.axis,
      rect: splitterRect,
      hitRect: {
        x: splitterRect.x - (SPLITTER_HIT_SIZE - SPLITTER_SIZE) / 2,
        y: splitterRect.y,
        width: SPLITTER_HIT_SIZE,
        height: splitterRect.height
      },
      splitRect: rect,
      ratio
    });
    layoutTree(node.first, firstRect, `${path}.first`, leaves, splitters);
    layoutTree(node.second, secondRect, `${path}.second`, leaves, splitters);
    return { leaves, splitters };
  }

  const availableHeight = Math.max(1, rect.height - SPLITTER_SIZE);
  const firstHeight = Math.round(availableHeight * ratio);
  const secondHeight = Math.max(1, availableHeight - firstHeight);
  const firstRect = { x: rect.x, y: rect.y, width: rect.width, height: firstHeight };
  const splitterRect = { x: rect.x, y: rect.y + firstHeight, width: rect.width, height: SPLITTER_SIZE };
  const secondRect = { x: rect.x, y: splitterRect.y + SPLITTER_SIZE, width: rect.width, height: secondHeight };

  splitters.push({
    path,
    axis: node.axis,
    rect: splitterRect,
    hitRect: {
      x: splitterRect.x,
      y: splitterRect.y - (SPLITTER_HIT_SIZE - SPLITTER_SIZE) / 2,
      width: splitterRect.width,
      height: SPLITTER_HIT_SIZE
    },
    splitRect: rect,
    ratio
  });
  layoutTree(node.first, firstRect, `${path}.first`, leaves, splitters);
  layoutTree(node.second, secondRect, `${path}.second`, leaves, splitters);
  return { leaves, splitters };
}

function pointInRect(x: number, y: number, rect: Rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function getDropZone(pointerX: number, pointerY: number, rect: Rect): DropZone {
  const left = pointerX - rect.x;
  const right = rect.x + rect.width - pointerX;
  const top = pointerY - rect.y;
  const bottom = rect.y + rect.height - pointerY;
  const nearest = Math.min(left, right, top, bottom);

  if (nearest === left) {
    return 'left';
  }
  if (nearest === right) {
    return 'right';
  }
  if (nearest === top) {
    return 'top';
  }
  return 'bottom';
}

function getDropPreviewRect(target: DropTarget): Rect {
  const { rect, zone } = target;
  if (zone === 'left') {
    return { ...rect, width: Math.max(32, rect.width * 0.32) };
  }
  if (zone === 'right') {
    const width = Math.max(32, rect.width * 0.32);
    return { x: rect.x + rect.width - width, y: rect.y, width, height: rect.height };
  }
  if (zone === 'top') {
    return { ...rect, height: Math.max(32, rect.height * 0.32) };
  }

  const height = Math.max(32, rect.height * 0.32);
  return { x: rect.x, y: rect.y + rect.height - height, width: rect.width, height };
}

function removePanel(node: DockNode, panelId: PanelId): DockNode | null {
  if (node.type === 'leaf') {
    return node.panelId === panelId ? null : node;
  }

  const first = removePanel(node.first, panelId);
  const second = removePanel(node.second, panelId);

  if (!first && !second) {
    return null;
  }
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }

  return {
    ...node,
    first,
    second
  };
}

function replaceTargetWithSplit(node: DockNode, targetPanelId: PanelId, draggedPanelId: PanelId, zone: DropZone): DockNode {
  if (node.type === 'leaf') {
    if (node.panelId !== targetPanelId) {
      return node;
    }

    const draggedLeaf: LeafNode = { type: 'leaf', panelId: draggedPanelId };
    const targetLeaf: LeafNode = { type: 'leaf', panelId: targetPanelId };

    if (zone === 'left') {
      return { type: 'split', axis: 'x', ratio: 0.32, first: draggedLeaf, second: targetLeaf };
    }
    if (zone === 'right') {
      return { type: 'split', axis: 'x', ratio: 0.68, first: targetLeaf, second: draggedLeaf };
    }
    if (zone === 'top') {
      return { type: 'split', axis: 'y', ratio: 0.32, first: draggedLeaf, second: targetLeaf };
    }
    return { type: 'split', axis: 'y', ratio: 0.68, first: targetLeaf, second: draggedLeaf };
  }

  return {
    ...node,
    first: replaceTargetWithSplit(node.first, targetPanelId, draggedPanelId, zone),
    second: replaceTargetWithSplit(node.second, targetPanelId, draggedPanelId, zone)
  };
}

function insertPanel(tree: DockNode, draggedPanelId: PanelId, target: DropTarget): DockNode {
  if (draggedPanelId === target.panelId) {
    return tree;
  }

  const withoutDragged = removePanel(tree, draggedPanelId);
  if (!withoutDragged) {
    return tree;
  }

  return replaceTargetWithSplit(withoutDragged, target.panelId, draggedPanelId, target.zone);
}

function updateSplitRatio(node: DockNode, path: string, ratio: number, currentPath = 'root'): DockNode {
  if (node.type === 'leaf') {
    return node;
  }

  if (currentPath === path) {
    return {
      ...node,
      ratio: clamp(ratio, 0.12, 0.88)
    };
  }

  return {
    ...node,
    first: updateSplitRatio(node.first, path, ratio, `${currentPath}.first`),
    second: updateSplitRatio(node.second, path, ratio, `${currentPath}.second`)
  };
}

function getSlotTitle(panelId: PanelId) {
  const labels: Record<PanelId, string> = {
    hierarchy: 'Hierarchy',
    project: 'Project',
    scene: 'SceneView',
    game: 'GameView',
    inspector: 'Inspector',
    console: 'Console'
  };

  return labels[panelId];
}

type DockableWorkspaceProps = {
  childrenByPanel: Record<PanelId, ReactNode>;
  saveLayoutRequest?: number;
  applyLayoutPresetRequest?: EditorLayoutPresetRequest | null;
  saveLayoutPresetRequest?: EditorLayoutPresetSaveRequest | null;
  onLayoutSaved?: () => void;
  onLayoutSaveError?: (message: string) => void;
  onLayoutPresetApplied?: (name: string) => void;
  onLayoutPresetSaved?: (name: string) => void;
};

export function DockableWorkspace({
  childrenByPanel,
  saveLayoutRequest = 0,
  applyLayoutPresetRequest,
  saveLayoutPresetRequest,
  onLayoutSaved,
  onLayoutSaveError,
  onLayoutPresetApplied,
  onLayoutPresetSaved
}: DockableWorkspaceProps) {
  const storedLayout = useMemo(() => loadStoredDockLayout(), []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const dragRef = useRef<DragPanelState | null>(null);
  const lastHandledSaveRequestRef = useRef(0);
  const lastHandledApplyPresetRequestRef = useRef(0);
  const lastHandledSavePresetRequestRef = useRef(0);
  const onLayoutSavedRef = useRef(onLayoutSaved);
  const onLayoutSaveErrorRef = useRef(onLayoutSaveError);
  const onLayoutPresetAppliedRef = useRef(onLayoutPresetApplied);
  const onLayoutPresetSavedRef = useRef(onLayoutPresetSaved);
  const [bounds, setBounds] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [tree, setTree] = useState<DockNode>(storedLayout ?? defaultDockTree);
  const [dragPanel, setDragPanel] = useState<DragPanelState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setBounds({
        x: 0,
        y: 0,
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height)
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadEditorDockLayout()
      .then((layout) => {
        if (!cancelled && isStoredDockLayout(layout)) {
          setTree(layout.tree);
        }
      })
      .catch(() => {
        // Local editor preferences are optional.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onLayoutSavedRef.current = onLayoutSaved;
    onLayoutSaveErrorRef.current = onLayoutSaveError;
    onLayoutPresetAppliedRef.current = onLayoutPresetApplied;
    onLayoutPresetSavedRef.current = onLayoutPresetSaved;
  }, [onLayoutPresetApplied, onLayoutPresetSaved, onLayoutSaveError, onLayoutSaved]);

  useEffect(() => {
    if (saveLayoutRequest <= 0 || saveLayoutRequest === lastHandledSaveRequestRef.current) {
      return;
    }

    lastHandledSaveRequestRef.current = saveLayoutRequest;
    const snapshot = { version: 2, tree } satisfies StoredDockLayout;
    saveStoredDockLayout(tree);
    void saveEditorDockLayout(snapshot)
      .then(() => onLayoutSavedRef.current?.())
      .catch((error) => onLayoutSaveErrorRef.current?.(error instanceof Error ? error.message : 'Failed to save editor layout'));
  }, [saveLayoutRequest, tree]);

  useEffect(() => {
    if (!applyLayoutPresetRequest || applyLayoutPresetRequest.requestId === lastHandledApplyPresetRequestRef.current) {
      return;
    }

    lastHandledApplyPresetRequestRef.current = applyLayoutPresetRequest.requestId;
    const preset = getDockLayoutPreset(applyLayoutPresetRequest.presetId);
    if (!preset) {
      onLayoutSaveErrorRef.current?.('Editor layout preset was not found');
      return;
    }

    const nextTree = cloneDockTree(preset.tree);
    setTree(nextTree);
    saveStoredDockLayout(nextTree);
    void saveEditorDockLayout({ version: 2, tree: nextTree } satisfies StoredDockLayout)
      .then(() => onLayoutPresetAppliedRef.current?.(preset.name))
      .catch((error) => onLayoutSaveErrorRef.current?.(error instanceof Error ? error.message : 'Failed to apply editor layout preset'));
  }, [applyLayoutPresetRequest]);

  useEffect(() => {
    if (!saveLayoutPresetRequest || saveLayoutPresetRequest.requestId === lastHandledSavePresetRequestRef.current) {
      return;
    }

    lastHandledSavePresetRequestRef.current = saveLayoutPresetRequest.requestId;
    const name = saveLayoutPresetRequest.name.trim();
    if (!name) {
      onLayoutSaveErrorRef.current?.('Editor layout preset name is required');
      return;
    }

    const nextPreset: CustomDockLayoutPreset = {
      id: saveLayoutPresetRequest.presetId,
      name,
      tree: cloneDockTree(tree),
      updatedAt: Date.now()
    };
    const existingPresets = loadCustomDockLayoutPresets().filter((preset) => preset.id !== nextPreset.id);
    saveCustomDockLayoutPresets([nextPreset, ...existingPresets]);
    saveStoredDockLayout(tree);
    void saveEditorDockLayout({ version: 2, tree } satisfies StoredDockLayout)
      .then(() => onLayoutPresetSavedRef.current?.(name))
      .catch((error) => onLayoutSaveErrorRef.current?.(error instanceof Error ? error.message : 'Failed to save editor layout preset'));
  }, [saveLayoutPresetRequest, tree]);

  const { leaves, splitters } = useMemo(() => layoutTree(tree, bounds), [bounds, tree]);

  const startPanelDrag = (leaf: LeafPlacement) => (event: PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const panelTitle = target.closest('.panel-title');
    const titleLabel = panelTitle?.querySelector(':scope > span');
    const titleHandleRight = titleLabel instanceof HTMLElement ? titleLabel.getBoundingClientRect().right + 10 : 0;
    if (
      !panelTitle ||
      event.clientX > titleHandleRight ||
      target.closest('button,input,select,textarea,.moveable-handle')
    ) {
      return;
    }

    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const nextDrag = {
      panelId: leaf.panelId,
      fromPath: leaf.path,
      pointerId: event.pointerId,
      offsetX: event.clientX - containerRect.left - leaf.rect.x,
      offsetY: event.clientY - containerRect.top - leaf.rect.y,
      x: leaf.rect.x,
      y: leaf.rect.y,
      width: leaf.rect.width,
      height: leaf.rect.height
    };

    dragRef.current = nextDrag;
    setDragPanel(nextDrag);
    setDropTarget(null);
  };

  const startResize = (splitter: SplitterPlacement) => (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    resizeRef.current = {
      pointerId: event.pointerId,
      path: splitter.path,
      axis: splitter.axis,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRatio: splitter.ratio,
      splitRect: splitter.splitRect
    };
  };

  const updatePointer = (event: PointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (resize?.pointerId === event.pointerId) {
      const available = resize.axis === 'x' ? resize.splitRect.width - SPLITTER_SIZE : resize.splitRect.height - SPLITTER_SIZE;
      const delta = resize.axis === 'x' ? event.clientX - resize.startClientX : event.clientY - resize.startClientY;
      const nextRatio = resize.startRatio + delta / Math.max(1, available);
      setTree((current) => updateSplitRatio(current, resize.path, nextRatio));
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      return;
    }

    const pointerX = event.clientX - containerRect.left;
    const pointerY = event.clientY - containerRect.top;
    const targetLeaf = leaves.find((leaf) => leaf.panelId !== drag.panelId && pointInRect(pointerX, pointerY, leaf.rect));
    const nextDrag = {
      ...drag,
      x: pointerX - drag.offsetX,
      y: pointerY - drag.offsetY
    };

    dragRef.current = nextDrag;
    setDragPanel(nextDrag);
    setDropTarget(targetLeaf ? { panelId: targetLeaf.panelId, zone: getDropZone(pointerX, pointerY, targetLeaf.rect), rect: targetLeaf.rect } : null);
  };

  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId === event.pointerId) {
      resizeRef.current = null;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (dropTarget) {
      setTree((current) => insertPanel(current, drag.panelId, dropTarget));
    }

    dragRef.current = null;
    setDragPanel(null);
    setDropTarget(null);
  };

  const dropPreviewRect = dropTarget ? getDropPreviewRect(dropTarget) : null;

  return (
    <main
      className="editor-workspace dock-workspace"
      onPointerMove={updatePointer}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      ref={containerRef}
    >
      {leaves.map((leaf) => {
        const style: CSSProperties = {
          left: leaf.rect.x,
          top: leaf.rect.y,
          width: leaf.rect.width,
          height: leaf.rect.height
        };

        return (
          <section
            className={`dock-panel dock-panel-${leaf.panelId}${dragPanel?.panelId === leaf.panelId ? ' is-drag-source' : ''}`}
            key={leaf.panelId}
            onPointerDown={startPanelDrag(leaf)}
            style={style}
          >
            {childrenByPanel[leaf.panelId]}
          </section>
        );
      })}

      {splitters.map((splitter) => (
        <div
          aria-label={`Resize dock split ${splitter.path}`}
          className={`dock-splitter ${splitter.axis === 'x' ? 'dock-splitter-vertical' : 'dock-splitter-horizontal'}`}
          key={splitter.path}
          onPointerDown={startResize(splitter)}
          style={{
            left: splitter.hitRect.x,
            top: splitter.hitRect.y,
            width: splitter.hitRect.width,
            height: splitter.hitRect.height
          }}
        />
      ))}

      {dropPreviewRect ? (
        <div
          className="dock-drop-preview"
          style={{
            left: dropPreviewRect.x,
            top: dropPreviewRect.y,
            width: dropPreviewRect.width,
            height: dropPreviewRect.height
          }}
        />
      ) : null}

      {dragPanel ? (
        <div
          className="dock-drag-preview"
          style={{
            left: dragPanel.x,
            top: dragPanel.y,
            width: dragPanel.width,
            height: dragPanel.height
          }}
        >
          {getSlotTitle(dragPanel.panelId)}
        </div>
      ) : null}
    </main>
  );
}
