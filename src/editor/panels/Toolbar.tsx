import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, FolderOpen, LayoutPanelTop, Plus, Redo2, RefreshCw, Save, Search, Undo2, X } from 'lucide-react';
import type { OpenProjectResult } from '../services/projectService';

const RECENT_PROJECTS_STORAGE_KEY = 'webapp-editor:recent-projects:v1';
const CUSTOM_LAYOUT_PRESETS_STORAGE_KEY = 'webapp-editor:dock-layout-custom-presets:v1';

const BUILTIN_LAYOUT_PRESETS = [
  { id: 'default', name: '默认布局' },
  { id: 'wide-edit', name: '宽屏编辑' },
  { id: 'debug-preview', name: '调试预览' }
];

type RecentProject = {
  name: string;
  path: string;
  openedAt: number;
};

type LayoutPresetSummary = {
  id: string;
  name: string;
};

type Props = {
  dirty: boolean;
  saving: boolean;
  loading: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onNewProject: () => void;
  onOpenProject: (projectPath?: string) => Promise<OpenProjectResult | null>;
  onSaveEditorLayout: () => void;
  onSelectEditorLayoutPreset: (presetId: string) => void;
  onSaveEditorLayoutPreset: (preset: LayoutPresetSummary) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReload: () => void;
  onSave: () => void;
};

function loadRecentProjects() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is RecentProject => {
        if (typeof item !== 'object' || item === null) {
          return false;
        }

        const value = item as Record<string, unknown>;
        return typeof value.name === 'string' && typeof value.path === 'string' && typeof value.openedAt === 'number';
      })
      .sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

function saveRecentProjects(projects: RecentProject[]) {
  window.localStorage.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(projects.slice(0, 30)));
}

function upsertRecentProject(projects: RecentProject[], result: OpenProjectResult) {
  if (!result.projectPath) {
    return projects;
  }

  const nextProject: RecentProject = {
    name: result.projectName ?? result.projectPath.split(/[\\/]/).at(-1) ?? 'Project',
    path: result.projectPath,
    openedAt: Date.now()
  };

  return [nextProject, ...projects.filter((project) => project.path !== nextProject.path)].slice(0, 30);
}

function formatRecentTime(openedAt: number) {
  return new Date(openedAt).toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function loadCustomLayoutPresetSummaries() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_LAYOUT_PRESETS_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is LayoutPresetSummary => {
        if (typeof item !== 'object' || item === null) {
          return false;
        }

        const value = item as Record<string, unknown>;
        return typeof value.id === 'string' && typeof value.name === 'string';
      })
      .map(({ id, name }) => ({ id, name }));
  } catch {
    return [];
  }
}

export function Toolbar({
  dirty,
  saving,
  loading,
  canUndo,
  canRedo,
  onNewProject,
  onOpenProject,
  onSaveEditorLayout,
  onSelectEditorLayoutPreset,
  onSaveEditorLayoutPreset,
  onUndo,
  onRedo,
  onReload,
  onSave
}: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const layoutMenuRef = useRef<HTMLDivElement | null>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [activeLayoutPresetId, setActiveLayoutPresetId] = useState<string | null>(null);
  const [customLayoutPresets, setCustomLayoutPresets] = useState<LayoutPresetSummary[]>(() => loadCustomLayoutPresetSummaries());
  const [newPresetDialogOpen, setNewPresetDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() => loadRecentProjects());
  const [recentQuery, setRecentQuery] = useState('');
  const [openingProjectPath, setOpeningProjectPath] = useState<string | null>(null);
  const saveDisabled = saving || loading || !dirty || import.meta.env.PROD;
  const matchingRecentProjects = recentProjects.filter((project) => {
    const query = recentQuery.trim().toLowerCase();
    return !query || `${project.name} ${project.path}`.toLowerCase().includes(query);
  });

  useEffect(() => {
    if (!fileMenuOpen && !layoutMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target)) {
        setFileMenuOpen(false);
      }
      if (!layoutMenuRef.current?.contains(target)) {
        setLayoutMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFileMenuOpen(false);
        setLayoutMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [fileMenuOpen, layoutMenuOpen]);

  const runMenuAction = (action: () => void) => {
    action();
    setFileMenuOpen(false);
  };

  const runLayoutMenuAction = (action: () => void) => {
    action();
    setLayoutMenuOpen(false);
  };

  const selectLayoutPreset = (presetId: string) => {
    setActiveLayoutPresetId(presetId);
    onSelectEditorLayoutPreset(presetId);
  };

  const openNewPresetDialog = () => {
    setNewPresetName('');
    setNewPresetDialogOpen(true);
  };

  const confirmNewPreset = () => {
    const name = newPresetName.trim();
    if (!name) {
      return;
    }

    const preset = {
      id: `custom_${Date.now()}`,
      name
    };
    setCustomLayoutPresets((current) => [preset, ...current.filter((item) => item.id !== preset.id)].slice(0, 30));
    setActiveLayoutPresetId(preset.id);
    onSaveEditorLayoutPreset(preset);
    setNewPresetDialogOpen(false);
  };

  const rememberProject = (result: OpenProjectResult | null) => {
    if (!result || result.cancelled || !result.projectPath) {
      return;
    }

    const nextProjects = upsertRecentProject(recentProjects, result);
    setRecentProjects(nextProjects);
    saveRecentProjects(nextProjects);
  };

  const openProjectFromManager = async (projectPath?: string) => {
    setOpeningProjectPath(projectPath ?? '__browse__');
    try {
      const result = await onOpenProject(projectPath);
      rememberProject(result);
      if (result && !result.cancelled) {
        setProjectManagerOpen(false);
      }
    } finally {
      setOpeningProjectPath(null);
    }
  };

  return (
    <header className="editor-toolbar">
      <div className="toolbar-menu" ref={menuRef}>
        <button
          className={`toolbar-menu-button ${fileMenuOpen ? 'is-open' : ''}`}
          type="button"
          onClick={() => setFileMenuOpen((current) => !current)}
        >
          文件
          <ChevronDown size={14} />
        </button>
        {fileMenuOpen ? (
          <div className="toolbar-dropdown">
            <button type="button" onClick={() => runMenuAction(onNewProject)}>
              新建项目
            </button>
            <button type="button" onClick={() => runMenuAction(() => setProjectManagerOpen(true))}>
              打开项目
            </button>
            <button type="button" disabled={saveDisabled} onClick={() => runMenuAction(onSave)}>
              保存项目
            </button>
          </div>
        ) : null}
      </div>
      <div className="toolbar-actions">
        <div className="toolbar-layout-menu" ref={layoutMenuRef}>
          <button
            className={`icon-button ${layoutMenuOpen ? 'is-open' : ''}`}
            type="button"
            onClick={() => {
              setCustomLayoutPresets(loadCustomLayoutPresetSummaries());
              setLayoutMenuOpen((current) => !current);
            }}
            title="Editor layout presets"
          >
            <LayoutPanelTop size={17} />
          </button>
          {layoutMenuOpen ? (
            <div className="toolbar-dropdown layout-dropdown">
              <div className="toolbar-dropdown-section-label">布局预设</div>
              {[...BUILTIN_LAYOUT_PRESETS, ...customLayoutPresets].map((preset) => (
                <button
                  className={activeLayoutPresetId === preset.id ? 'is-active' : ''}
                  key={preset.id}
                  type="button"
                  onClick={() => runLayoutMenuAction(() => selectLayoutPreset(preset.id))}
                >
                  <span>{preset.name}</span>
                  {activeLayoutPresetId === preset.id ? <Check size={14} /> : null}
                </button>
              ))}
              <div className="toolbar-dropdown-divider" />
              <button type="button" onClick={() => runLayoutMenuAction(onSaveEditorLayout)}>
                <Save size={14} />
                <span>保存当前</span>
              </button>
              <button type="button" onClick={() => runLayoutMenuAction(openNewPresetDialog)}>
                <Plus size={14} />
                <span>保存新预设</span>
              </button>
            </div>
          ) : null}
        </div>
        <button className="icon-button" type="button" onClick={onUndo} title="Undo (Ctrl+Z)" disabled={!canUndo}>
          <Undo2 size={17} />
        </button>
        <button className="icon-button" type="button" onClick={onRedo} title="Redo (Ctrl+Y / Ctrl+Shift+Z)" disabled={!canRedo}>
          <Redo2 size={17} />
        </button>
        <button className="icon-button" type="button" onClick={onReload} title="Reload project" disabled={loading}>
          <RefreshCw size={17} />
        </button>
        <button className="primary-button" type="button" onClick={onSave} disabled={saveDisabled} title="Save layout JSON">
          <Save size={17} />
          <span>{saving ? 'Saving' : import.meta.env.PROD ? 'Save disabled' : 'Save'}</span>
        </button>
      </div>
      {projectManagerOpen ? (
        <div className="modal-backdrop project-manager-backdrop" role="presentation" onMouseDown={() => setProjectManagerOpen(false)}>
          <div
            className="project-manager-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Open project"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="project-manager-header">
              <div>
                <strong>打开项目</strong>
                <small>选择最近打开的 WebApp 项目，或浏览文件夹打开新的项目。</small>
              </div>
              <button className="icon-button" type="button" aria-label="Close project manager" onClick={() => setProjectManagerOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="project-manager-toolbar">
              <label className="project-manager-search">
                <Search size={15} />
                <input
                  type="search"
                  placeholder="搜索最近项目"
                  value={recentQuery}
                  onChange={(event) => setRecentQuery(event.target.value)}
                />
              </label>
              <button
                className="primary-button"
                type="button"
                disabled={openingProjectPath !== null}
                onClick={() => void openProjectFromManager()}
              >
                <FolderOpen size={16} />
                浏览项目文件夹
              </button>
            </div>
            <div className="recent-project-list" role="list" aria-label="Recent projects">
              {matchingRecentProjects.map((project) => (
                <button
                  key={project.path}
                  className="recent-project-row"
                  type="button"
                  disabled={openingProjectPath !== null}
                  onDoubleClick={() => void openProjectFromManager(project.path)}
                >
                  <span>
                    <strong>{project.name}</strong>
                    <small>{project.path}</small>
                  </span>
                  <em>{openingProjectPath === project.path ? 'Opening' : formatRecentTime(project.openedAt)}</em>
                </button>
              ))}
              {matchingRecentProjects.length === 0 ? (
                <div className="project-manager-empty">没有最近项目。点击“浏览项目文件夹”选择包含 project.webapp.json 的项目目录。</div>
              ) : null}
            </div>
            <div className="project-manager-footer">
              <span>双击最近项目即可打开。</span>
            </div>
          </div>
        </div>
      ) : null}
      {newPresetDialogOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setNewPresetDialogOpen(false)}>
          <div className="editor-modal layout-preset-modal" role="dialog" aria-modal="true" aria-label="Save layout preset" onMouseDown={(event) => event.stopPropagation()}>
            <div className="editor-modal-heading">
              <strong>保存新布局预设</strong>
              <small>输入预设名后，当前编辑器面板布局会保存到下拉列表。</small>
            </div>
            <label className="field field-wide">
              <span>预设名</span>
              <input
                autoFocus
                value={newPresetName}
                onChange={(event) => setNewPresetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmNewPreset();
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setNewPresetDialogOpen(false);
                  }
                }}
              />
            </label>
            <div className="editor-modal-actions">
              <button type="button" onClick={() => setNewPresetDialogOpen(false)}>
                取消
              </button>
              <button className="primary-button" type="button" disabled={!newPresetName.trim()} onClick={confirmNewPreset}>
                确认
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
