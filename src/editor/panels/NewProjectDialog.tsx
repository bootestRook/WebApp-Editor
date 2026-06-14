import { useMemo, useState } from 'react';
import { FolderOpen, FolderPlus, X } from 'lucide-react';

type Props = {
  onCancel: () => void;
  onCreate: (targetPath: string, projectName: string) => Promise<void>;
  onBrowseParentFolder: (initialPath?: string) => Promise<string | null>;
};

function sanitizeProjectName(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/^\.+/, '')
      .replace(/\.+$/, '') || 'Untitled WebApp'
  );
}

function joinProjectPath(parentFolder: string, projectName: string) {
  const parent = parentFolder.trim();
  const name = sanitizeProjectName(projectName);
  if (!parent) {
    return name;
  }

  const separator = parent.includes('\\') ? '\\' : '/';
  const trimmedParent =
    parent.endsWith(':\\') || parent.endsWith(':/')
      ? parent
      : parent.replace(/[\\/]+$/, '');
  return `${trimmedParent}${trimmedParent.endsWith('\\') || trimmedParent.endsWith('/') ? '' : separator}${name}`;
}

export function NewProjectDialog({ onCancel, onCreate, onBrowseParentFolder }: Props) {
  const [projectName, setProjectName] = useState('Untitled WebApp');
  const [parentFolder, setParentFolder] = useState('');
  const [creating, setCreating] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetPath = useMemo(() => joinProjectPath(parentFolder, projectName), [parentFolder, projectName]);
  const busy = creating || browsing;
  const canCreate = projectName.trim().length > 0 && parentFolder.trim().length > 0 && !busy;

  const browseParentFolder = async () => {
    if (busy) {
      return;
    }

    setBrowsing(true);
    setError(null);
    try {
      const selectedPath = await onBrowseParentFolder(parentFolder.trim() || undefined);
      if (selectedPath) {
        setParentFolder(selectedPath);
      }
    } catch (browseError) {
      setError(browseError instanceof Error ? browseError.message : 'Failed to browse parent folder');
    } finally {
      setBrowsing(false);
    }
  };

  const submit = async () => {
    if (!canCreate) {
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await onCreate(targetPath, projectName.trim());
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create project');
      setCreating(false);
    }
  };

  return (
    <div className="modal-backdrop new-project-backdrop" role="presentation" onMouseDown={busy ? undefined : onCancel}>
      <div
        className="editor-modal new-project-modal"
        role="dialog"
        aria-modal="true"
        aria-label="New project"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="editor-modal-heading new-project-heading">
          <div>
            <strong>New Project</strong>
            <small>Create an external WebApp project folder and open it in the editor.</small>
          </div>
          <button className="icon-button" type="button" aria-label="Close new project dialog" disabled={busy} onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <label className="field field-wide">
          <span>Project Name</span>
          <input
            autoFocus
            value={projectName}
            disabled={busy}
            onChange={(event) => setProjectName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }

              if (event.key === 'Escape' && !busy) {
                event.preventDefault();
                onCancel();
              }
            }}
          />
        </label>
        <div className="field field-wide">
          <label htmlFor="new-project-parent-folder">Parent Folder</label>
          <div className="field-action-row">
            <input
              id="new-project-parent-folder"
              value={parentFolder}
              disabled={busy}
              placeholder="F:\\WebApp Projects"
              onChange={(event) => setParentFolder(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submit();
                }

                if (event.key === 'Escape' && !busy) {
                  event.preventDefault();
                  onCancel();
                }
              }}
            />
            <button className="field-action-button" type="button" disabled={busy} onClick={() => void browseParentFolder()}>
              <FolderOpen size={15} />
              <span>{browsing ? 'Browsing' : 'Browse'}</span>
            </button>
          </div>
        </div>
        <label className="field field-wide">
          <span>Target Path</span>
          <input readOnly value={targetPath} />
        </label>
        {error ? <div className="new-project-error" role="alert">{error}</div> : null}
        <div className="editor-modal-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="button" disabled={!canCreate} onClick={() => void submit()}>
            <FolderPlus size={16} />
            <span>{creating ? 'Creating' : 'Create'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
