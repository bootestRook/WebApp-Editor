import { useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react';
import { ChevronDown, ChevronRight, FileCode2, FileImage, Folder, FolderKanban, Search, Trash2 } from 'lucide-react';
import type { ProjectAsset, RuntimeElement } from '../../runtime/runtimeTypes';
import { createComponentAsset, deleteAsset, loadAssets, revealAsset, revealProjectFile } from '../services/projectService';
import { openLayout, saveLayout } from '../services/layoutService';
import { useEditorStore } from '../store/editorStore';

type ContextMenuState = {
  x: number;
  y: number;
  assetPath: string | null;
} | null;

type AssetTreeNode = {
  asset: ProjectAsset;
  children: AssetTreeNode[];
};

type ComponentAssetDraft = {
  element: RuntimeElement;
  name: string;
} | null;

function getContextMenuPosition(event: MouseEvent<HTMLElement>, assetPath: string | null) {
  const menuWidth = 240;
  const menuHeight = assetPath ? 84 : 148;
  return {
    x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
    y: Math.min(event.clientY, window.innerHeight - menuHeight - 8)
  };
}

function fuzzyMatch(value: string, query: string) {
  const source = value.toLowerCase();
  const target = query.trim().toLowerCase();
  if (!target) {
    return true;
  }

  let cursor = 0;
  for (const char of target) {
    cursor = source.indexOf(char, cursor);
    if (cursor === -1) {
      return false;
    }
    cursor += 1;
  }

  return true;
}

function getOrderedAssets(assets: ProjectAsset[], order: string[]) {
  const orderMap = new Map(order.map((path, index) => [path, index]));
  return [...assets].sort((a, b) => {
    const aIndex = orderMap.get(a.path) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = orderMap.get(b.path) ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }
    return a.path.localeCompare(b.path);
  });
}

function getBasename(path: string) {
  return path.split('/').at(-1) ?? path;
}

function getAssetIcon(kind: ProjectAsset['kind']) {
  if (kind === 'folder') {
    return <Folder size={15} />;
  }

  if (kind === 'component' || kind === 'layout' || kind === 'script' || kind === 'data') {
    return <FileCode2 size={15} />;
  }

  return <FileImage size={15} />;
}

function getParentPath(path: string) {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

function isLayoutAsset(asset: ProjectAsset | null | undefined) {
  return Boolean(asset && asset.kind === 'layout' && asset.path.startsWith('layouts/') && asset.path.endsWith('.json'));
}

function isAssetFile(asset: ProjectAsset | null | undefined) {
  return Boolean(asset?.assetPath && asset.kind !== 'folder');
}

function isDraggableProjectAsset(asset: ProjectAsset | null | undefined) {
  return Boolean(asset && asset.kind !== 'folder' && !isLayoutAsset(asset) && (asset.assetPath || asset.kind === 'script'));
}

function buildAssetTree(assets: ProjectAsset[]) {
  const byPath = new Map<string, AssetTreeNode>();
  const roots: AssetTreeNode[] = [];

  for (const asset of assets) {
    byPath.set(asset.path, { asset, children: [] });
  }

  for (const node of byPath.values()) {
    const parentPath = getParentPath(node.asset.path);
    const parent = parentPath ? byPath.get(parentPath) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: AssetTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.asset.kind === 'folder' && b.asset.kind !== 'folder') {
        return -1;
      }
      if (a.asset.kind !== 'folder' && b.asset.kind === 'folder') {
        return 1;
      }
      return a.asset.name.localeCompare(b.asset.name);
    });
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);
  return roots;
}

function flattenVisibleTree(nodes: AssetTreeNode[], expanded: Set<string>, query: string, depth = 0): Array<{ node: AssetTreeNode; depth: number }> {
  const result: Array<{ node: AssetTreeNode; depth: number }> = [];
  const hasQuery = query.trim().length > 0;

  for (const node of nodes) {
    const selfMatches = fuzzyMatch(`${node.asset.name} ${node.asset.path} ${node.asset.kind}`, query);
    const childRows = flattenVisibleTree(node.children, expanded, query, depth + 1);
    const includeForSearch = hasQuery ? selfMatches || childRows.length > 0 : true;

    if (!includeForSearch) {
      continue;
    }

    result.push({ node, depth });
    if (node.asset.kind === 'folder' && (hasQuery || expanded.has(node.asset.path))) {
      result.push(...childRows);
    }
  }

  return result;
}

function loadAssetOrder() {
  try {
    const raw = window.localStorage.getItem('webapp-editor:project-asset-order:v1');
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveAssetOrder(order: string[]) {
  try {
    window.localStorage.setItem('webapp-editor:project-asset-order:v1', JSON.stringify(order));
  } catch {
    // Non-critical editor preference.
  }
}

function isEditingText(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function ProjectPanel() {
  const { state, dispatch } = useEditorStore();
  const [query, setQuery] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [assetOrder, setAssetOrder] = useState<string[]>(() => loadAssetOrder());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(['layouts', 'ui']));
  const [componentAssetDraft, setComponentAssetDraft] = useState<ComponentAssetDraft>(null);
  const [pendingLayoutPath, setPendingLayoutPath] = useState<string | null>(null);
  const assets = useMemo(() => getOrderedAssets(state.assets, assetOrder), [assetOrder, state.assets]);
  const assetTree = useMemo(() => buildAssetTree(assets), [assets]);
  const visibleRows = useMemo(() => flattenVisibleTree(assetTree, expandedFolders, query), [assetTree, expandedFolders, query]);
  const visibleAssets = visibleRows.map((row) => row.node.asset);
  const visiblePaths = visibleAssets.map((asset) => asset.path);
  const contextAsset = contextMenu?.assetPath
    ? assets.find((asset) => asset.path === contextMenu.assetPath) ?? null
    : null;

  const refreshAssets = async () => {
    dispatch({ type: 'set-assets', assets: await loadAssets() });
  };

  const selectAsset = (asset: ProjectAsset) => (event: MouseEvent<HTMLElement>) => {
    dispatch({ type: 'set-selection-scope', scope: 'assets' });

    if (event.shiftKey && selectionAnchor) {
      const start = visiblePaths.indexOf(selectionAnchor);
      const end = visiblePaths.indexOf(asset.path);
      if (start !== -1 && end !== -1) {
        setSelectedPaths(visiblePaths.slice(Math.min(start, end), Math.max(start, end) + 1));
        return;
      }
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedPaths((current) =>
        current.includes(asset.path) ? current.filter((path) => path !== asset.path) : [...current, asset.path]
      );
      setSelectionAnchor(asset.path);
      return;
    }

    setSelectedPaths([asset.path]);
    setSelectionAnchor(asset.path);
  };

  const openContextMenu = (assetPath: string | null) => (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dispatch({ type: 'set-selection-scope', scope: 'assets' });
    if (assetPath && !selectedPaths.includes(assetPath)) {
      setSelectedPaths([assetPath]);
      setSelectionAnchor(assetPath);
    }
    setContextMenu({ ...getContextMenuPosition(event, assetPath), assetPath });
  };

  const closeContextMenu = () => setContextMenu(null);

  const deleteAssetPaths = async (paths: string[]) => {
    const targets = paths.filter((path) => {
      const asset = assets.find((item) => item.path === path);
      return isAssetFile(asset);
    });
    if (targets.length === 0) {
      return;
    }

    for (const path of targets) {
      const asset = assets.find((item) => item.path === path);
      if (asset?.assetPath) {
        await deleteAsset(asset.assetPath);
      }
    }
    closeContextMenu();
    setSelectedPaths([]);
    dispatch({ type: 'log', message: `Deleted ${targets.length} asset${targets.length === 1 ? '' : 's'}` });
    await refreshAssets();
  };

  const deleteSelectedAssets = async () => {
    const targets = selectedPaths.length > 0 ? selectedPaths : contextMenu?.assetPath ? [contextMenu.assetPath] : [];
    await deleteAssetPaths(targets);
  };

  const revealSelectedAsset = async () => {
    const selectedPath = contextMenu?.assetPath ?? selectedPaths[0];
    const asset = selectedPath ? assets.find((item) => item.path === selectedPath) : null;
    if (asset?.assetPath) {
      await revealAsset(asset.assetPath);
    } else {
      await revealProjectFile(asset?.path);
    }
    closeContextMenu();
  };

  const handleDragStart = (asset: ProjectAsset) => (event: DragEvent<HTMLDivElement>) => {
    if (!isDraggableProjectAsset(asset)) {
      event.preventDefault();
      return;
    }

    const payload = {
      kind: 'webapp-project-asset',
      asset
    };
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('application/webapp-asset', JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', asset.path);
  };

  const toggleFolder = (path: string) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    dispatch({ type: 'set-selection-scope', scope: 'assets' });
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const getDraggedHierarchyElement = (event: DragEvent<HTMLElement>) => {
    const raw = event.dataTransfer.getData('application/webapp-hierarchy-element');
    if (!raw) {
      return null;
    }

    try {
      const payload = JSON.parse(raw) as { kind?: string; element?: RuntimeElement };
      return payload.kind === 'webapp-hierarchy-element' && payload.element ? payload.element : null;
    } catch {
      return null;
    }
  };

  const openCreateComponentAssetDialog = (element: RuntimeElement) => {
    setContextMenu(null);
    setComponentAssetDraft({
      element,
      name: element.name
    });
  };

  const openLayoutPath = async (layoutPath: string) => {
    try {
      dispatch({ type: 'log', message: `Opening layout ${layoutPath}` });
      const layout = await openLayout(layoutPath);
      dispatch({ type: 'open-layout:success', layout, path: layoutPath });
      setPendingLayoutPath(null);
    } catch (error) {
      dispatch({
        type: 'log',
        message: error instanceof Error ? error.message : 'Failed to open layout'
      });
    }
  };

  const requestOpenLayout = (asset: ProjectAsset) => {
    if (!isLayoutAsset(asset)) {
      return;
    }

    if (state.dirty) {
      setPendingLayoutPath(asset.path);
      return;
    }

    void openLayoutPath(asset.path);
  };

  const saveThenOpenPendingLayout = async () => {
    if (!pendingLayoutPath || !state.layout) {
      return;
    }

    dispatch({ type: 'save:start' });
    try {
      await saveLayout(state.layout);
      dispatch({ type: 'save:success' });
      await openLayoutPath(pendingLayoutPath);
    } catch (error) {
      dispatch({
        type: 'save:error',
        error: error instanceof Error ? error.message : 'Failed to save layout JSON'
      });
    }
  };

  const handleProjectDragOver = (event: DragEvent<HTMLElement>) => {
    if (event.dataTransfer.types.includes('application/webapp-hierarchy-element')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleProjectDrop = (event: DragEvent<HTMLElement>) => {
    const draggedElement = getDraggedHierarchyElement(event);
    if (!draggedElement) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    openCreateComponentAssetDialog(draggedElement);
    return true;
  };

  const handleAssetDrop = (targetPath: string) => (event: DragEvent<HTMLDivElement>) => {
    if (handleProjectDrop(event)) {
      return;
    }

    const draggedPath = event.dataTransfer.getData('text/plain');
    if (!draggedPath || draggedPath === targetPath || !visiblePaths.includes(draggedPath)) {
      return;
    }

    event.preventDefault();
    const nextOrder = assets.map((asset) => asset.path).filter((path) => path !== draggedPath);
    const targetIndex = nextOrder.indexOf(targetPath);
    nextOrder.splice(targetIndex, 0, draggedPath);
    setAssetOrder(nextOrder);
    saveAssetOrder(nextOrder);
  };

  const confirmCreateComponentAsset = async () => {
    if (!componentAssetDraft) {
      return;
    }

    try {
      const result = await createComponentAsset(componentAssetDraft.name, componentAssetDraft.element);
      setComponentAssetDraft(null);
      setExpandedFolders((current) => new Set([...current, 'components']));
      dispatch({ type: 'log', message: `Created component asset ${result.target}` });
      await refreshAssets();
    } catch (error) {
      dispatch({
        type: 'log',
        message: error instanceof Error ? error.message : 'Failed to create component asset'
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        event.key !== 'Delete' ||
        state.activeSelectionScope !== 'assets' ||
        selectedPaths.length === 0 ||
        isEditingText(event.target)
      ) {
        return;
      }

      event.preventDefault();
      void deleteAssetPaths(selectedPaths);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assets, selectedPaths, state.activeSelectionScope]);

  return (
    <section
      className="panel project-panel"
      onContextMenu={openContextMenu(null)}
      onDragOver={handleProjectDragOver}
      onDrop={(event) => {
        handleProjectDrop(event);
      }}
      onPointerDown={() => dispatch({ type: 'set-selection-scope', scope: 'assets' })}
    >
      <div className="panel-title">
        <FolderKanban size={16} />
        <span>Project</span>
      </div>
      <div className="project-meta">
        <span>{state.project?.name ?? 'Loading Project'}</span>
        <small>{state.activeLayoutPath ?? state.project?.entryLayout ?? 'layouts/main_page.layout.json'}</small>
      </div>
      <label className="project-search">
        <Search size={14} />
        <input
          aria-label="Search project assets"
          placeholder="Search assets"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div
        className="asset-list"
        onClick={() => {
          dispatch({ type: 'set-selection-scope', scope: 'assets' });
          setSelectedPaths([]);
        }}
        onContextMenu={openContextMenu(null)}
        onDragOver={handleProjectDragOver}
        onDrop={(event) => {
          handleProjectDrop(event);
        }}
      >
        {visibleRows.map(({ node, depth }) => {
          const asset = node.asset;
          const isFolder = asset.kind === 'folder';

          return (
          <div
            className={`asset-row${selectedPaths.includes(asset.path) ? ' is-selected' : ''}`}
            draggable={isDraggableProjectAsset(asset)}
            key={asset.path}
            onClick={(event) => {
              event.stopPropagation();
              selectAsset(asset)(event);
            }}
            onContextMenu={openContextMenu(asset.path)}
            onDoubleClick={(event) => {
              event.stopPropagation();
              requestOpenLayout(asset);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (event.dataTransfer.types.includes('application/webapp-hierarchy-element')) {
                event.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={handleAssetDrop(asset.path)}
            onDragStart={handleDragStart(asset)}
            style={{ paddingLeft: 6 + depth * 18 }}
          >
            {isFolder ? (
              <button className="asset-disclosure" type="button" onClick={toggleFolder(asset.path)}>
                {expandedFolders.has(asset.path) || query ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            ) : (
              <span className="asset-disclosure-spacer" />
            )}
            {getAssetIcon(asset.kind)}
            <span>{getBasename(asset.path)}</span>
            <small>{asset.kind}</small>
          </div>
          );
        })}
        {visibleAssets.length === 0 ? <div className="empty-state">No matching assets</div> : null}
      </div>
      {contextMenu ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          {contextMenu.assetPath ? (
            <>
              {isLayoutAsset(contextAsset) ? (
                <button type="button" onClick={() => contextAsset && requestOpenLayout(contextAsset)}>
                  Open Layout
                </button>
              ) : contextAsset?.path.startsWith('layouts') ? (
                <button type="button" onClick={() => void refreshAssets()}>
                  Refresh
                </button>
              ) : (
                <button type="button" onClick={revealSelectedAsset}>
                  Open in File Explorer
                </button>
              )}
              {isAssetFile(contextAsset) ? (
                <button className="danger-menu-item" type="button" onClick={deleteSelectedAssets}>
                  <Trash2 size={14} />
                  Delete
                </button>
              ) : null}
            </>
          ) : (
            <>
                <button type="button" onClick={() => void revealProjectFile()}>
                  Open Project Folder
                </button>
              <button type="button" onClick={() => void refreshAssets()}>
                Refresh
              </button>
              <button type="button" disabled>
                Create Folder
              </button>
              <button type="button" disabled>
                Import Asset
              </button>
            </>
          )}
        </div>
      ) : null}
      {contextMenu ? <button className="context-menu-backdrop" type="button" onClick={closeContextMenu} /> : null}
      {pendingLayoutPath ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPendingLayoutPath(null)}>
          <div className="editor-modal" role="dialog" aria-modal="true" aria-label="Unsaved layout changes" onMouseDown={(event) => event.stopPropagation()}>
            <div className="editor-modal-heading">
              <strong>当前界面尚未保存</strong>
              <small>打开 {pendingLayoutPath} 前，需要决定如何处理当前 layout 的未保存改动。</small>
            </div>
            <div className="editor-modal-actions">
              <button type="button" onClick={() => setPendingLayoutPath(null)}>
                取消
              </button>
              <button type="button" onClick={() => void openLayoutPath(pendingLayoutPath)}>
                不保存
              </button>
              <button className="primary-button" type="button" onClick={() => void saveThenOpenPendingLayout()}>
                保存并打开
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {componentAssetDraft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setComponentAssetDraft(null)}>
          <div className="editor-modal" role="dialog" aria-modal="true" aria-label="Create component asset" onMouseDown={(event) => event.stopPropagation()}>
            <div className="editor-modal-heading">
              <strong>Create Component Asset?</strong>
              <small>{componentAssetDraft.element.name} will be saved as a reusable Project asset.</small>
            </div>
            <label className="field field-wide">
              <span>Asset Name</span>
              <input
                autoFocus
                value={componentAssetDraft.name}
                onChange={(event) =>
                  setComponentAssetDraft((current) =>
                    current
                      ? {
                          ...current,
                          name: event.target.value
                        }
                      : current
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void confirmCreateComponentAsset();
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setComponentAssetDraft(null);
                  }
                }}
              />
            </label>
            <div className="editor-modal-actions">
              <button type="button" onClick={() => setComponentAssetDraft(null)}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={() => void confirmCreateComponentAsset()}>
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
