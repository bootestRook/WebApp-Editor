import { useCallback, useEffect, useRef } from 'react';
import { ConsolePanel } from './panels/ConsolePanel';
import { DockableWorkspace } from './DockableWorkspace';
import { GameView } from './panels/GameView';
import { HierarchyPanel } from './panels/HierarchyPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { ProjectPanel } from './panels/ProjectPanel';
import { SceneView } from './panels/SceneView';
import { Toolbar } from './panels/Toolbar';
import { loadAssets, loadProject, openProject, type OpenProjectResult } from './services/projectService';
import { loadLayout, saveLayout } from './services/layoutService';
import { useEditorStore } from './store/editorStore';
import './editor.css';

function isEditingText(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const NUDGE_HOLD_DELAY_MS = 220;
const NUDGE_INTERVAL_MS = 45;
const NUDGE_ACCELERATION_MS = 2500;
const MAX_NUDGE_STEP = 120;

function getNudgeDirection(keys: Set<string>) {
  return {
    dx: (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0),
    dy: (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0)
  };
}

function getAcceleratedNudgeStep(startedAt: number) {
  const elapsed = performance.now() - startedAt;
  const progress = Math.min(1, elapsed / NUDGE_ACCELERATION_MS);
  return Math.min(MAX_NUDGE_STEP, 1 + Math.floor(progress * (MAX_NUDGE_STEP - 1)));
}

export function EditorApp() {
  const { state, dispatch } = useEditorStore();
  const stateRef = useRef(state);
  const handleSaveRef = useRef<(() => Promise<void>) | null>(null);
  const nudgeRef = useRef<{
    groupActive: boolean;
    holdStartedAt: number;
    pressedKeys: Set<string>;
    holdDelayTimer: number | null;
    timer: number | null;
  }>({
    groupActive: false,
    holdStartedAt: 0,
    pressedKeys: new Set(),
    holdDelayTimer: null,
    timer: null
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const reload = useCallback(async () => {
    dispatch({ type: 'load:start' });
    try {
      const [project, layout, assets] = await Promise.all([loadProject(), loadLayout(), loadAssets()]);
      dispatch({ type: 'load:success', project, layout, assets });
    } catch (error) {
      dispatch({
        type: 'load:error',
        error: error instanceof Error ? error.message : 'Failed to load project'
      });
    }
  }, [dispatch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSave = useCallback(async () => {
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
  }, [dispatch, state.layout]);

  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  useEffect(() => {
    const stopArrowNudge = () => {
      if (nudgeRef.current.holdDelayTimer !== null) {
        window.clearTimeout(nudgeRef.current.holdDelayTimer);
      }
      if (nudgeRef.current.timer !== null) {
        window.clearInterval(nudgeRef.current.timer);
      }
      nudgeRef.current.holdDelayTimer = null;
      nudgeRef.current.timer = null;
      nudgeRef.current.pressedKeys.clear();
      if (nudgeRef.current.groupActive) {
        nudgeRef.current.groupActive = false;
        dispatch({ type: 'end-history-group' });
      }
    };

    const nudgeSelectedElements = (step: number) => {
      const currentState = stateRef.current;
      if (
        currentState.activeSelectionScope !== 'elements' ||
        currentState.selectedElementIds.length === 0 ||
        !currentState.layout
      ) {
        stopArrowNudge();
        return;
      }

      const direction = getNudgeDirection(nudgeRef.current.pressedKeys);
      if (direction.dx === 0 && direction.dy === 0) {
        return;
      }

      dispatch({
        type: 'nudge-elements',
        ids: currentState.selectedElementIds,
        dx: direction.dx * step,
        dy: direction.dy * step
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const currentState = stateRef.current;

      if (ARROW_KEYS.has(event.key) && !isEditingText(event.target)) {
        if (currentState.activeSelectionScope === 'elements' && currentState.selectedElementIds.length > 0) {
          event.preventDefault();
          if (!nudgeRef.current.pressedKeys.has(event.key)) {
            nudgeRef.current.pressedKeys.add(event.key);
          }

          if (!nudgeRef.current.groupActive) {
            nudgeRef.current.groupActive = true;
            nudgeRef.current.holdStartedAt = performance.now();
            dispatch({ type: 'begin-history-group', label: 'Keyboard Nudge' });
            nudgeSelectedElements(1);
          }

          if (nudgeRef.current.holdDelayTimer === null && nudgeRef.current.timer === null) {
            nudgeRef.current.holdDelayTimer = window.setTimeout(() => {
              nudgeRef.current.holdDelayTimer = null;
              nudgeRef.current.timer = window.setInterval(() => {
                nudgeSelectedElements(getAcceleratedNudgeStep(nudgeRef.current.holdStartedAt));
              }, NUDGE_INTERVAL_MS);
            }, NUDGE_HOLD_DELAY_MS);
          }
          return;
        }
      }

      if (
        event.key === 'Delete' &&
        currentState.activeSelectionScope === 'elements' &&
        currentState.selectedElementIds.length > 0 &&
        !isEditingText(event.target)
      ) {
        event.preventDefault();
        dispatch({ type: 'delete-elements', ids: currentState.selectedElementIds });
        return;
      }

      const hasModifier = event.ctrlKey || event.metaKey;
      if (!hasModifier) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        void handleSaveRef.current?.();
        return;
      }

      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }

      if (key === 'z') {
        event.preventDefault();
        dispatch({ type: 'undo' });
        return;
      }

      if (key === 'y') {
        event.preventDefault();
        dispatch({ type: 'redo' });
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!ARROW_KEYS.has(event.key)) {
        return;
      }

      nudgeRef.current.pressedKeys.delete(event.key);
      if (nudgeRef.current.pressedKeys.size === 0) {
        stopArrowNudge();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', stopArrowNudge);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', stopArrowNudge);
      stopArrowNudge();
    };
  }, [dispatch]);

  return (
    <div className="editor-shell">
      <Toolbar
        dirty={state.dirty}
        loading={state.loading}
        saving={state.saving}
        canRedo={state.historyFuture.length > 0}
        canUndo={state.historyPast.length > 0}
        onNewProject={() =>
          dispatch({ type: 'log', message: 'Use npm run new-project -- <folder> to create a project folder, then npm run dev:project -- <folder> to open it.' })
        }
        onOpenProject={async (projectPath?: string): Promise<OpenProjectResult | null> => {
            try {
              const result = await openProject(projectPath);
              if (result.cancelled) {
                dispatch({ type: 'log', message: 'Open Project cancelled' });
                return result;
              }
              dispatch({ type: 'log', message: `Opened ${result.projectName ?? 'project'}` });
              void reload();
              return result;
            } catch (error) {
              dispatch({
                type: 'log',
                message: error instanceof Error ? error.message : 'Failed to open project'
              });
              return null;
            }
        }}
        onRedo={() => dispatch({ type: 'redo' })}
        onReload={reload}
        onSave={handleSave}
        onUndo={() => dispatch({ type: 'undo' })}
      />
      <DockableWorkspace
        childrenByPanel={{
          hierarchy: <HierarchyPanel />,
          project: <ProjectPanel />,
          scene: <SceneView />,
          game: <GameView />,
          inspector: <InspectorPanel />,
          console: <ConsolePanel />
        }}
      />
    </div>
  );
}
