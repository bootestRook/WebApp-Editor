import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Edit3, Eye, EyeOff, Layers, Plus, Search, Trash2 } from 'lucide-react';
import type { ElementType, RuntimeElement } from '../../runtime/runtimeTypes';
import { applyAssetOverrides } from '../services/projectService';
import { useEditorStore } from '../store/editorStore';

type ContextMenuState =
  | {
      kind: 'element';
      x: number;
      y: number;
      elementId: string;
    }
  | {
      kind: 'blank';
      x: number;
      y: number;
    };

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

export function HierarchyPanel() {
  const { state, dispatch } = useEditorStore();
  const [query, setQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const elements = state.layout?.elements ?? [];
  const visibleElements = useMemo(
    () => elements.filter((element) => fuzzyMatch(`${element.name} ${element.id} ${element.type}`, query)),
    [elements, query]
  );
  const visibleIds = visibleElements.map((element) => element.id);

  const handleSelect = (id: string) => (event: MouseEvent<HTMLElement>) => {
    dispatch({ type: 'set-selection-scope', scope: 'elements' });

    if (event.shiftKey) {
      dispatch({ type: 'select', id, mode: 'range', orderedIds: visibleIds });
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      dispatch({ type: 'select', id, mode: 'toggle' });
      return;
    }

    dispatch({ type: 'select', id });
  };

  const handleToggleVisibility = (id: string, visible: boolean) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dispatch({ type: 'set-selection-scope', scope: 'elements' });
    dispatch({ type: 'update-element', id, patch: { visible: !visible } });
  };

  const handleDragStart = (elementId: string) => (event: DragEvent<HTMLDivElement>) => {
    const element = elements.find((item) => item.id === elementId);
    if (!element || renamingId === elementId) {
      event.preventDefault();
      return;
    }

    dispatch({ type: 'set-selection-scope', scope: 'elements' });
    if (!state.selectedElementIds.includes(elementId)) {
      dispatch({ type: 'select', id: elementId });
    }
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(
      'application/webapp-hierarchy-element',
      JSON.stringify({
        kind: 'webapp-hierarchy-element',
        element
      })
    );
    event.dataTransfer.setData('text/plain', element.name);
  };

  const openContextMenu = (id: string) => (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dispatch({ type: 'set-selection-scope', scope: 'elements' });
    if (!state.selectedElementIds.includes(id)) {
      dispatch({ type: 'select', id });
    }
    setContextMenu({ kind: 'element', x: event.clientX, y: event.clientY, elementId: id });
  };

  const openBlankContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    dispatch({ type: 'set-selection-scope', scope: 'elements' });
    dispatch({ type: 'select', id: null });
    setContextMenu({ kind: 'blank', x: event.clientX, y: event.clientY });
  };

  const contextElement =
    contextMenu?.kind === 'element'
      ? elements.find((element) => element.id === contextMenu.elementId)
      : null;

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'F2' || state.selectedElementIds.length !== 1) {
        return;
      }

      const selected = elements.find((element) => element.id === state.selectedElementIds[0]);
      if (!selected) {
        return;
      }

      event.preventDefault();
      setRenamingId(selected.id);
      setRenameValue(selected.name);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [elements, state.selectedElementIds]);

  const startRename = (elementId: string) => {
    const element = elements.find((item) => item.id === elementId);
    if (!element) {
      return;
    }

    setContextMenu(null);
    dispatch({ type: 'select', id: element.id });
    setRenamingId(element.id);
    setRenameValue(element.name);
  };

  const getCreatedElementBase = (type: ElementType, name: string): RuntimeElement => {
    const offset = (elements.length % 8) * 28;
    return {
      id: `${type}_${Date.now()}`,
      type,
      name,
      x: 140 + offset,
      y: 140 + offset,
      width: 320,
      height: 96
    };
  };

  const createElement = (kind: 'empty' | 'panel' | 'text' | 'button') => {
    let element: RuntimeElement;

    if (kind === 'empty') {
      element = {
        ...getCreatedElementBase('panel', 'Empty Node'),
        width: 160,
        height: 120,
        style: {
          fill: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0,
          radius: 0
        }
      };
    } else if (kind === 'text') {
      element = {
        ...getCreatedElementBase('text', 'Text Box'),
        width: 420,
        height: 72,
        text: 'Text Box',
        style: {
          color: '#ffffff',
          fontSize: 36,
          fontWeight: 700
        }
      };
    } else if (kind === 'button') {
      element = {
        ...getCreatedElementBase('button', 'Button'),
        width: 280,
        height: 80,
        text: 'Button',
        style: {
          fill: '#2f80ed',
          color: '#ffffff',
          fontSize: 28,
          fontWeight: 700,
          radius: 12
        }
      };
    } else {
      element = {
        ...getCreatedElementBase('panel', 'Panel'),
        width: 420,
        height: 240,
        style: {
          fill: '#223047',
          borderColor: '#42536f',
          borderWidth: 2,
          radius: 16
        }
      };
    }

    dispatch({ type: 'add-element', element });
    setContextMenu(null);
  };

  const commitRename = () => {
    const nextName = renameValue.trim();
    if (!renamingId || !nextName) {
      setRenamingId(null);
      return;
    }

    dispatch({ type: 'update-element', id: renamingId, patch: { name: nextName } });
    setRenamingId(null);
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setRenamingId(null);
    }
  };

  const applyToSource = async () => {
    if (!contextElement?.sourceAsset) {
      return;
    }
    try {
      await applyAssetOverrides(contextElement.sourceAsset, contextElement);
      dispatch({ type: 'log', message: `Applied overrides to ${contextElement.sourceAsset}` });
      setContextMenu(null);
    } catch (error) {
      dispatch({
        type: 'log',
        message: error instanceof Error ? error.message : `Failed to apply overrides to ${contextElement.sourceAsset}`
      });
    }
  };

  return (
    <section className="panel hierarchy-panel">
      <div className="panel-title">
        <Layers size={16} />
        <span>Hierarchy</span>
      </div>
      <label className="hierarchy-search">
        <Search size={14} />
        <input
          aria-label="Search hierarchy"
          placeholder="Search components"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div
        className="hierarchy-list"
        onClick={() => dispatch({ type: 'select', id: null })}
        onContextMenu={openBlankContextMenu}
      >
        {visibleElements.map((element) => (
          <div
            className={`hierarchy-item${state.selectedElementIds.includes(element.id) ? ' is-selected' : ''}${state.selectedElementId === element.id ? ' is-active' : ''}`}
            draggable={renamingId !== element.id}
            key={element.id}
            onClick={(event) => {
              event.stopPropagation();
              handleSelect(element.id)(event);
            }}
            onContextMenu={openContextMenu(element.id)}
            onDragStart={handleDragStart(element.id)}
          >
            <button
              className="hierarchy-visibility-button"
              type="button"
              title={element.visible === false ? 'Show component' : 'Hide component'}
              onClick={handleToggleVisibility(element.id, element.visible !== false)}
            >
              {element.visible === false ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            {renamingId === element.id ? (
              <input
                autoFocus
                className="hierarchy-rename-input"
                value={renameValue}
                onBlur={commitRename}
                onChange={(event) => setRenameValue(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={handleRenameKeyDown}
              />
            ) : (
              <span>{element.name}</span>
            )}
            <small>{element.type}</small>
          </div>
        ))}
        {visibleElements.length === 0 ? <div className="empty-state">No matching components</div> : null}
      </div>
      {contextMenu ? (
        <>
          <button className="context-menu-backdrop" type="button" onClick={() => setContextMenu(null)} />
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            {contextMenu.kind === 'blank' ? (
              <>
                <button type="button" onClick={() => createElement('empty')}>
                  <Plus size={14} />
                  创建空白节点
                </button>
                <button type="button" onClick={() => createElement('panel')}>
                  创建面板
                </button>
                <button type="button" onClick={() => createElement('text')}>
                  创建文本框
                </button>
                <button type="button" onClick={() => createElement('button')}>
                  创建按钮
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={state.selectedElementIds.length !== 1}
                  onClick={() => startRename(contextMenu.elementId)}
                >
                  <Edit3 size={14} />
                  Rename
                </button>
                <button type="button" disabled={!contextElement?.sourceAsset} onClick={applyToSource}>
                  Apply to Source Asset
                </button>
                <button
                  className="danger-menu-item"
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'delete-elements', ids: state.selectedElementIds.length ? state.selectedElementIds : [contextMenu.elementId] });
                    setContextMenu(null);
                  }}
                >
                  <Trash2 size={14} />
                  Delete Object
                </button>
              </>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
