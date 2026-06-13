import { useMemo, useState, type DragEvent } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, Code2, Layers, Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { ProjectAsset, RuntimeElement, RuntimeScriptBinding, RuntimeStyle } from '../../runtime/runtimeTypes';
import { saveLayout } from '../services/layoutService';
import { useEditorStore } from '../store/editorStore';

const LAYER_GROUP_STORAGE_KEY = 'webapp-editor:layer-groups:v1';
const PRESET_LAYER_GROUPS = [
  { name: 'Background', order: -100 },
  { name: 'Default', order: 0 },
  { name: 'UI', order: 100 },
  { name: 'Overlay', order: 200 },
  { name: 'Modal', order: 300 }
];

function asInt(value: string) {
  return Math.round(Number(value) || 0);
}

function loadCustomLayerGroups() {
  try {
    const raw = window.localStorage.getItem(LAYER_GROUP_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && value.length > 0) : [];
  } catch {
    return [];
  }
}

function saveCustomLayerGroups(groups: string[]) {
  window.localStorage.setItem(LAYER_GROUP_STORAGE_KEY, JSON.stringify(Array.from(new Set(groups))));
}

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onBeginEdit: () => void;
  onEndEdit: () => void;
};

function NumberField({ label, value, onChange, onBeginEdit, onEndEdit }: NumberFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={1}
        value={value}
        onBlur={onEndEdit}
        onChange={(event) => onChange(asInt(event.target.value))}
        onFocus={onBeginEdit}
      />
    </label>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBeginEdit: () => void;
  onEndEdit: () => void;
};

function TextField({ label, value, onChange, onBeginEdit, onEndEdit }: TextFieldProps) {
  return (
    <label className="field field-wide">
      <span>{label}</span>
      <input type="text" value={value} onBlur={onEndEdit} onChange={(event) => onChange(event.target.value)} onFocus={onBeginEdit} />
    </label>
  );
}

function ColorField({ label, value, onChange, onBeginEdit, onEndEdit }: TextFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="color" value={value} onBlur={onEndEdit} onChange={(event) => onChange(event.target.value)} onFocus={onBeginEdit} />
    </label>
  );
}

type ImageFitFieldProps = {
  value: RuntimeStyle['fit'];
  onChange: (value: NonNullable<RuntimeStyle['fit']>) => void;
  onBeginEdit: () => void;
  onEndEdit: () => void;
};

function ImageFitField({ value, onChange, onBeginEdit, onEndEdit }: ImageFitFieldProps) {
  return (
    <label className="field">
      <span>Fit</span>
      <select
        value={value ?? 'fill'}
        onBlur={onEndEdit}
        onChange={(event) => onChange(event.target.value as NonNullable<RuntimeStyle['fit']>)}
        onFocus={onBeginEdit}
      >
        <option value="fill">Fill</option>
        <option value="contain">Contain</option>
        <option value="cover">Cover</option>
      </select>
    </label>
  );
}

type TextAlignFieldProps = {
  value: RuntimeStyle['textAlign'];
  onChange: (value: NonNullable<RuntimeStyle['textAlign']>) => void;
  onBeginEdit: () => void;
  onEndEdit: () => void;
};

function TextAlignField({ value, onChange, onBeginEdit, onEndEdit }: TextAlignFieldProps) {
  const current = value ?? 'left';
  const options = [
    { value: 'left', label: 'Left', icon: <AlignLeft size={15} /> },
    { value: 'center', label: 'Center', icon: <AlignCenter size={15} /> },
    { value: 'right', label: 'Right', icon: <AlignRight size={15} /> }
  ] as const;

  return (
    <div className="field field-wide">
      <span>Align</span>
      <div className="segmented-control" role="group" aria-label="Text alignment">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={current === option.value ? 'is-active' : ''}
            title={option.label}
            onClick={() => {
              onBeginEdit();
              onChange(option.value);
              onEndEdit();
            }}
          >
            {option.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

function makeScriptId(name: string) {
  const safeName = name.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[^A-Za-z]+/, '') || 'Script';
  return `script_${safeName}_${Date.now()}`;
}

function getScriptNameFromPath(scriptPath: string) {
  const basename = scriptPath.split('/').at(-1) ?? scriptPath;
  return basename.replace(/\.(tsx?|jsx?|mjs|cjs)$/i, '') || 'CustomScript';
}

function readDraggedProjectAsset(event: DragEvent<HTMLElement>) {
  const raw = event.dataTransfer.getData('application/webapp-asset');
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw) as { kind?: string; asset?: ProjectAsset };
    return payload.kind === 'webapp-project-asset' && payload.asset ? payload.asset : null;
  } catch {
    return null;
  }
}

type ScriptPathPickerProps = {
  value: string;
  assets: ProjectAsset[];
  placeholder: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

function ScriptPathPicker({ value, assets, placeholder, onChange, onFocus, onBlur }: ScriptPathPickerProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const query = showAll ? '' : value.trim().toLowerCase();
  const filteredAssets = assets.filter((asset) => {
    if (!query) {
      return true;
    }

    return `${asset.name} ${asset.path}`.toLowerCase().includes(query);
  });

  const selectPath = (path: string) => {
    onChange(path);
    setOpen(false);
    setShowAll(false);
  };

  return (
    <div className="script-path-picker">
      <input
        aria-label="Script path"
        value={value}
        onBlur={() => {
          onBlur?.();
          window.setTimeout(() => {
            setOpen(false);
            setShowAll(false);
          }, 120);
        }}
        onChange={(event) => {
          setShowAll(false);
          setOpen(true);
          onChange(event.target.value);
        }}
        onFocus={() => {
          onFocus?.();
          setOpen(true);
        }}
        placeholder={placeholder}
      />
      <button
        className="script-path-picker-button"
        type="button"
        title="Browse scripts"
        aria-label="Browse scripts"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setShowAll(true);
          setOpen((current) => !current);
        }}
      >
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="script-path-menu">
          {filteredAssets.length > 0 ? (
            filteredAssets.map((asset) => (
              <button
                key={asset.path}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectPath(asset.path);
                }}
              >
                <strong>{asset.name}</strong>
                <small>{asset.path}</small>
              </button>
            ))
          ) : (
            <div className="script-path-empty">No script assets</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function InspectorPanel() {
  const { state, selectedElement, dispatch } = useEditorStore();
  const [newScriptName, setNewScriptName] = useState('CustomScript');
  const [newScriptPath, setNewScriptPath] = useState('scripts/CustomScript.ts');
  const [scriptsDragActive, setScriptsDragActive] = useState(false);
  const [customLayerGroups, setCustomLayerGroups] = useState<string[]>(() => loadCustomLayerGroups());
  const [newLayerGroupName, setNewLayerGroupName] = useState('Gameplay');
  const layerGroups = [...PRESET_LAYER_GROUPS.map((group) => group.name), ...customLayerGroups];
  const scriptAssets = useMemo(
    () =>
      state.assets
        .filter((asset) => asset.kind === 'script' && !asset.path.endsWith('.d.ts'))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [state.assets]
  );

  const updateElement = (patch: Partial<RuntimeElement>) => {
    if (!selectedElement) {
      return;
    }

    dispatch({ type: 'update-element', id: selectedElement.id, patch });
  };

  const updateStyle = (patch: RuntimeStyle) => {
    updateElement({
      style: {
        ...(selectedElement?.style ?? {}),
        ...patch
      }
    });
  };

  const updateScripts = (scripts: RuntimeScriptBinding[]) => {
    updateElement({ scripts });
  };

  const updateLayerGroup = (layerGroup: string) => {
    const preset = PRESET_LAYER_GROUPS.find((group) => group.name === layerGroup);
    const existingLayerOrder = state.layout?.elements.find((element) => (element.layerGroup ?? 'Default') === layerGroup)?.layerOrder;
    updateElement({
      layerGroup,
      layerOrder: existingLayerOrder ?? preset?.order ?? selectedElement?.layerOrder ?? 0
    });
  };

  const updateCurrentGroupLayerOrder = (layerOrder: number) => {
    if (!selectedElement) {
      return;
    }

    dispatch({
      type: 'update-layer-group-order',
      group: selectedElement.layerGroup ?? 'Default',
      layerOrder
    });
  };

  const addLayerGroup = () => {
    const name = newLayerGroupName.trim();
    if (!name) {
      return;
    }

    const nextGroups = Array.from(new Set([...customLayerGroups, name]));
    setCustomLayerGroups(nextGroups);
    saveCustomLayerGroups(nextGroups);
    updateLayerGroup(name);
  };

  const addScript = () => {
    if (!selectedElement) {
      return;
    }

    const path = newScriptPath.trim();
    const name = newScriptName.trim() || (path ? getScriptNameFromPath(path) : 'CustomScript');
    const resolvedPath = path || `scripts/${name}.ts`;
    updateScripts([
      ...(selectedElement.scripts ?? []),
      {
        id: makeScriptId(name),
        name,
        path: resolvedPath,
        enabled: true
      }
    ]);
  };

  const addScriptAsset = (asset: ProjectAsset) => {
    if (!selectedElement || asset.kind !== 'script') {
      return;
    }

    const path = asset.path;
    const name = getScriptNameFromPath(path);
    updateScripts([
      ...(selectedElement.scripts ?? []),
      {
        id: makeScriptId(name),
        name,
        path,
        enabled: true
      }
    ]);
    dispatch({ type: 'log', message: `Added script ${path} to ${selectedElement.name}` });
  };

  const updateScript = (id: string, patch: Partial<RuntimeScriptBinding>) => {
    if (!selectedElement) {
      return;
    }

    updateScripts((selectedElement.scripts ?? []).map((script) => (script.id === id ? { ...script, ...patch } : script)));
  };

  const removeScript = (id: string) => {
    if (!selectedElement) {
      return;
    }

    updateScripts((selectedElement.scripts ?? []).filter((script) => script.id !== id));
  };

  const beginEdit = () => dispatch({ type: 'begin-history-group', label: 'Edit Inspector Property' });
  const endEdit = () => dispatch({ type: 'end-history-group' });

  const handleSave = async () => {
    if (!state.layout || import.meta.env.PROD) {
      return;
    }

    dispatch({ type: 'save:start' });
    try {
      await saveLayout(state.layout);
      dispatch({ type: 'save:success' });
    } catch (error) {
      dispatch({
        type: 'save:error',
        error: error instanceof Error ? error.message : 'Failed to save layout JSON'
      });
    }
  };

  const handleScriptsDragOver = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('application/webapp-asset')) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setScriptsDragActive(true);
  };

  const handleScriptsDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('application/webapp-asset')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setScriptsDragActive(false);
    const asset = readDraggedProjectAsset(event);
    if (!asset) {
      return;
    }

    if (asset.kind !== 'script') {
      dispatch({ type: 'log', message: 'Only script assets can be dropped into the Scripts section' });
      return;
    }

    addScriptAsset(asset);
  };

  return (
    <section className="panel inspector-panel">
      <div className="panel-title">
        <SlidersHorizontal size={16} />
        <span>Inspector</span>
        <button
          type="button"
          className="panel-title-icon-button"
          title="Save current layout"
          aria-label="Save current layout"
          disabled={!state.layout || state.saving || import.meta.env.PROD}
          onClick={() => void handleSave()}
        >
          <Save size={14} />
        </button>
      </div>
      {!selectedElement ? (
        <div className="empty-state">No element selected</div>
      ) : (
        <div className="inspector-form">
          <div className="inspector-heading">
            <strong>{selectedElement.name}</strong>
            <small>{selectedElement.id}</small>
          </div>
          <div className="field-grid">
            <NumberField label="X" value={selectedElement.x} onBeginEdit={beginEdit} onEndEdit={endEdit} onChange={(x) => updateElement({ x })} />
            <NumberField label="Y" value={selectedElement.y} onBeginEdit={beginEdit} onEndEdit={endEdit} onChange={(y) => updateElement({ y })} />
            <NumberField
              label="W"
              value={selectedElement.width}
              onBeginEdit={beginEdit}
              onEndEdit={endEdit}
              onChange={(width) => updateElement({ width: Math.max(1, width) })}
            />
            <NumberField
              label="H"
              value={selectedElement.height}
              onBeginEdit={beginEdit}
              onEndEdit={endEdit}
              onChange={(height) => updateElement({ height: Math.max(1, height) })}
            />
          </div>
          {selectedElement.type !== 'panel' && selectedElement.type !== 'image' ? (
            <TextField label="Text" value={selectedElement.text ?? ''} onBeginEdit={beginEdit} onEndEdit={endEdit} onChange={(text) => updateElement({ text })} />
          ) : null}
          {selectedElement.type === 'text' ? (
            <TextAlignField
              value={selectedElement.style?.textAlign}
              onBeginEdit={beginEdit}
              onEndEdit={endEdit}
              onChange={(textAlign) => updateStyle({ textAlign })}
            />
          ) : null}
          {selectedElement.type === 'image' ? (
            <TextField label="Source" value={selectedElement.src ?? ''} onBeginEdit={beginEdit} onEndEdit={endEdit} onChange={(src) => updateElement({ src })} />
          ) : null}
          <div className="field-grid">
            {selectedElement.type !== 'image' ? (
              <ColorField
                label={selectedElement.type === 'text' ? 'Text' : 'Fill'}
                value={
                  selectedElement.type === 'text'
                    ? (selectedElement.style?.color ?? '#ffffff')
                    : (selectedElement.style?.fill ?? '#2f80ed')
                }
                onBeginEdit={beginEdit}
                onEndEdit={endEdit}
                onChange={(value) =>
                  selectedElement.type === 'text' ? updateStyle({ color: value }) : updateStyle({ fill: value })
                }
              />
            ) : null}
            {selectedElement.type === 'image' ? (
              <ImageFitField
                value={selectedElement.style?.fit}
                onBeginEdit={beginEdit}
                onEndEdit={endEdit}
                onChange={(fit) => updateStyle({ fit })}
              />
            ) : null}
            {selectedElement.type === 'panel' ? (
              <ColorField
                label="Border"
                value={selectedElement.style?.borderColor ?? '#000000'}
                onBeginEdit={beginEdit}
                onEndEdit={endEdit}
                onChange={(borderColor) => updateStyle({ borderColor })}
              />
            ) : null}
            {selectedElement.type !== 'image' ? (
              <NumberField
                label="Font"
                value={selectedElement.style?.fontSize ?? 24}
                onBeginEdit={beginEdit}
                onEndEdit={endEdit}
                onChange={(fontSize) => updateStyle({ fontSize: Math.max(1, fontSize) })}
              />
            ) : null}
            <NumberField
              label="Radius"
              value={selectedElement.style?.radius ?? 0}
              onBeginEdit={beginEdit}
              onEndEdit={endEdit}
              onChange={(radius) => updateStyle({ radius: Math.max(0, radius) })}
            />
          </div>
          <div className="inspector-section">
            <div className="inspector-section-title">
              <Layers size={15} />
              <span>Layer</span>
            </div>
            <label className="field field-wide">
              <span>Group</span>
              <select value={selectedElement.layerGroup ?? 'Default'} onChange={(event) => updateLayerGroup(event.target.value)}>
                {layerGroups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-grid">
              <NumberField
                label="Layer Order"
                value={selectedElement.layerOrder ?? 0}
                onBeginEdit={beginEdit}
                onEndEdit={endEdit}
                onChange={updateCurrentGroupLayerOrder}
              />
              <NumberField
                label="Order"
                value={selectedElement.orderInLayer ?? 0}
                onBeginEdit={beginEdit}
                onEndEdit={endEdit}
                onChange={(orderInLayer) => updateElement({ orderInLayer })}
              />
            </div>
            <div className="add-layer-row">
              <input value={newLayerGroupName} onChange={(event) => setNewLayerGroupName(event.target.value)} placeholder="Custom group" />
              <button type="button" onClick={addLayerGroup}>
                <Plus size={14} />
                Add Group
              </button>
            </div>
          </div>
          <div
            className={`inspector-section scripts-section${scriptsDragActive ? ' is-drop-target' : ''}`}
            onDragEnter={handleScriptsDragOver}
            onDragLeave={() => setScriptsDragActive(false)}
            onDragOver={handleScriptsDragOver}
            onDrop={handleScriptsDrop}
          >
            <div className="inspector-section-title">
              <Code2 size={15} />
              <span>Scripts</span>
            </div>
            <div className="script-list">
              {(selectedElement.scripts ?? []).map((script) => (
                <div className="script-binding" key={script.id}>
                  <label className="script-enabled">
                    <input
                      type="checkbox"
                      checked={script.enabled !== false}
                      onChange={(event) => updateScript(script.id, { enabled: event.target.checked })}
                    />
                  </label>
                  <input
                    aria-label="Script name"
                    value={script.name}
                    onBlur={endEdit}
                    onChange={(event) => updateScript(script.id, { name: event.target.value })}
                    onFocus={beginEdit}
                  />
                  <ScriptPathPicker
                    assets={scriptAssets}
                    placeholder="Search script"
                    value={script.path ?? ''}
                    onBlur={endEdit}
                    onChange={(path) => {
                      updateScript(script.id, { path, name: script.name.trim() ? script.name : getScriptNameFromPath(path) });
                    }}
                    onFocus={beginEdit}
                  />
                  <button type="button" aria-label="Remove script" onClick={() => removeScript(script.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="add-script-row">
              <input value={newScriptName} onChange={(event) => setNewScriptName(event.target.value)} placeholder="Script name" />
              <ScriptPathPicker
                assets={scriptAssets}
                placeholder="Search or drop script"
                value={newScriptPath}
                onChange={(path) => {
                  setNewScriptPath(path);
                  if (!newScriptName.trim() || newScriptName === 'CustomScript') {
                    setNewScriptName(getScriptNameFromPath(path));
                  }
                }}
              />
              <button type="button" onClick={addScript}>
                <Plus size={14} />
                Add Script
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
