import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderOpen, Redo2, RefreshCw, Save, Search, Undo2, X } from 'lucide-react';
import type { OpenProjectResult } from '../services/projectService';

const RECENT_PROJECTS_STORAGE_KEY = 'webapp-editor:recent-projects:v1';

type RecentProject = {
  name: string;
  path: string;
  openedAt: number;
};

type Props = {
  dirty: boolean;
  saving: boolean;
  loading: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onNewProject: () => void;
  onOpenProject: (projectPath?: string) => Promise<OpenProjectResult | null>;
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

export function Toolbar({
  dirty,
  saving,
  loading,
  canUndo,
  canRedo,
  onNewProject,
  onOpenProject,
  onUndo,
  onRedo,
  onReload,
  onSave
}: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
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
    if (!fileMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setFileMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFileMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [fileMenuOpen]);

  const runMenuAction = (action: () => void) => {
    action();
    setFileMenuOpen(false);
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
    </header>
  );
}
