import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type { ProjectAsset, RuntimeElement, WebAppLayout, WebAppProject } from '../../runtime/runtimeTypes';

type EditorState = {
  project: WebAppProject | null;
  layout: WebAppLayout | null;
  activeLayoutPath: string | null;
  historyPast: WebAppLayout[];
  historyFuture: WebAppLayout[];
  historyActive: {
    before: WebAppLayout;
    label: string;
  } | null;
  assets: ProjectAsset[];
  selectedElementId: string | null;
  selectedElementIds: string[];
  selectionAnchorId: string | null;
  activeSelectionScope: 'elements' | 'assets';
  loading: boolean;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  console: string[];
};

type EditorAction =
  | { type: 'load:start' }
  | { type: 'load:success'; project: WebAppProject; layout: WebAppLayout; assets: ProjectAsset[] }
  | { type: 'load:error'; error: string }
  | { type: 'open-layout:success'; layout: WebAppLayout; path: string }
  | { type: 'select'; id: string | null; mode?: 'replace' | 'toggle' | 'range'; orderedIds?: string[] }
  | { type: 'set-selection-scope'; scope: 'elements' | 'assets' }
  | { type: 'set-assets'; assets: ProjectAsset[] }
  | { type: 'begin-history-group'; label: string }
  | { type: 'end-history-group' }
  | { type: 'add-element'; element: RuntimeElement }
  | { type: 'delete-elements'; ids: string[] }
  | { type: 'reorder-elements'; ids: string[]; targetId: string; position: 'before' | 'after' }
  | { type: 'update-element'; id: string; patch: Partial<RuntimeElement> }
  | { type: 'update-layer-group-order'; group: string; layerOrder: number }
  | { type: 'nudge-elements'; ids: string[]; dx: number; dy: number }
  | { type: 'update-asset-path'; from: string; to: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'save:start' }
  | { type: 'save:success' }
  | { type: 'save:error'; error: string }
  | { type: 'log'; message: string }
  | { type: 'clear-console' };

const initialState: EditorState = {
  project: null,
  layout: null,
  activeLayoutPath: null,
  historyPast: [],
  historyFuture: [],
  historyActive: null,
  assets: [],
  selectedElementId: null,
  selectedElementIds: [],
  selectionAnchorId: null,
  activeSelectionScope: 'elements',
  loading: false,
  dirty: false,
  saving: false,
  error: null,
  console: []
};

function appendLog(state: EditorState, message: string) {
  return [...state.console, `${new Date().toLocaleTimeString()} ${message}`].slice(-80);
}

function cloneLayout(layout: WebAppLayout): WebAppLayout {
  return JSON.parse(JSON.stringify(layout)) as WebAppLayout;
}

function pushHistory(state: EditorState) {
  if (!state.layout) {
    return state.historyPast;
  }

  return [...state.historyPast, cloneLayout(state.layout)].slice(-80);
}

function layoutsEqual(left: WebAppLayout | null, right: WebAppLayout | null) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

function selectRange(anchorId: string | null, targetId: string, orderedIds: string[]) {
  if (!anchorId || orderedIds.length === 0) {
    return [targetId];
  }

  const anchorIndex = orderedIds.indexOf(anchorId);
  const targetIndex = orderedIds.indexOf(targetId);
  if (anchorIndex === -1 || targetIndex === -1) {
    return [targetId];
  }

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return orderedIds.slice(start, end + 1);
}

function commitHistoryGroup(state: EditorState): EditorState {
  if (!state.historyActive || !state.layout) {
    return state;
  }

  if (layoutsEqual(state.historyActive.before, state.layout)) {
    return {
      ...state,
      historyActive: null
    };
  }

  return {
    ...state,
    historyActive: null,
    historyPast: [...state.historyPast, cloneLayout(state.historyActive.before)].slice(-80)
  };
}

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load:start':
      return {
        ...state,
        loading: true,
        error: null,
        console: appendLog(state, 'Loading project')
      };
    case 'load:success':
      return {
        ...state,
        loading: false,
        project: action.project,
        layout: action.layout,
        activeLayoutPath: action.project.entryLayout,
        historyPast: [],
        historyFuture: [],
        historyActive: null,
        assets: action.assets,
        selectedElementId: action.layout.elements[0]?.id ?? null,
        selectedElementIds: action.layout.elements[0]?.id ? [action.layout.elements[0].id] : [],
        selectionAnchorId: action.layout.elements[0]?.id ?? null,
        activeSelectionScope: 'elements',
        dirty: false,
        console: appendLog(state, `Loaded ${action.project.name}`)
      };
    case 'load:error':
      return {
        ...state,
        loading: false,
        error: action.error,
        console: appendLog(state, action.error)
      };
    case 'open-layout:success':
      return {
        ...state,
        layout: action.layout,
        activeLayoutPath: action.path,
        historyPast: [],
        historyFuture: [],
        historyActive: null,
        selectedElementId: action.layout.elements[0]?.id ?? null,
        selectedElementIds: action.layout.elements[0]?.id ? [action.layout.elements[0].id] : [],
        selectionAnchorId: action.layout.elements[0]?.id ?? null,
        activeSelectionScope: 'elements',
        dirty: false,
        error: null,
        console: appendLog(state, `Opened layout ${action.path}`)
      };
    case 'select':
      if (!action.id) {
        return {
          ...state,
          selectedElementId: null,
          selectedElementIds: [],
          selectionAnchorId: null,
          activeSelectionScope: 'elements'
        };
      }

      if (action.mode === 'toggle') {
        {
          const exists = state.selectedElementIds.includes(action.id);
          const selectedElementIds = exists
            ? state.selectedElementIds.filter((id) => id !== action.id)
            : uniqueIds([...state.selectedElementIds, action.id]);
          return {
            ...state,
            selectedElementId: exists ? (selectedElementIds.at(-1) ?? null) : action.id,
            selectedElementIds,
            selectionAnchorId: action.id,
            activeSelectionScope: 'elements'
          };
        }
      }

      if (action.mode === 'range') {
        {
          const selectedElementIds = selectRange(state.selectionAnchorId, action.id, action.orderedIds ?? []);
          return {
            ...state,
            selectedElementId: action.id,
            selectedElementIds,
            selectionAnchorId: state.selectionAnchorId ?? action.id,
            activeSelectionScope: 'elements'
          };
        }
      }

      return {
        ...state,
        selectedElementId: action.id,
        selectedElementIds: [action.id],
        selectionAnchorId: action.id,
        activeSelectionScope: 'elements'
      };
    case 'set-selection-scope':
      return {
        ...state,
        activeSelectionScope: action.scope
      };
    case 'set-assets':
      return {
        ...state,
        assets: action.assets,
        console: appendLog(state, 'Refreshed project assets')
      };
    case 'begin-history-group':
      if (!state.layout || state.historyActive) {
        return state;
      }

      return {
        ...state,
        historyActive: {
          before: cloneLayout(state.layout),
          label: action.label
        }
      };
    case 'end-history-group':
      return commitHistoryGroup(state);
    case 'add-element':
      if (!state.layout) {
        return state;
      }

      return {
        ...state,
        dirty: true,
        historyPast: pushHistory(state),
        historyFuture: [],
        selectedElementId: action.element.id,
        selectedElementIds: [action.element.id],
        selectionAnchorId: action.element.id,
        activeSelectionScope: 'elements',
        layout: {
          ...state.layout,
          elements: [...state.layout.elements, action.element]
        },
        console: appendLog(state, `Created ${action.element.name}`)
      };
    case 'delete-elements':
      if (!state.layout || action.ids.length === 0) {
        return state;
      }

      return {
        ...state,
        dirty: true,
        historyPast: pushHistory(state),
        historyFuture: [],
        selectedElementId: null,
        selectedElementIds: [],
        selectionAnchorId: null,
        activeSelectionScope: 'elements',
        layout: {
          ...state.layout,
          elements: state.layout.elements.filter((element) => !action.ids.includes(element.id))
        },
        console: appendLog(state, `Deleted ${action.ids.length} object${action.ids.length === 1 ? '' : 's'}`)
      };
    case 'reorder-elements':
      if (!state.layout || action.ids.length === 0) {
        return state;
      }

      {
        const movingIds = new Set(action.ids);
        if (movingIds.has(action.targetId)) {
          return state;
        }

        const movingElements = state.layout.elements.filter((element) => movingIds.has(element.id));
        if (movingElements.length === 0) {
          return state;
        }

        const remainingElements = state.layout.elements.filter((element) => !movingIds.has(element.id));
        const targetIndex = remainingElements.findIndex((element) => element.id === action.targetId);
        if (targetIndex === -1) {
          return state;
        }

        const insertIndex = action.position === 'after' ? targetIndex + 1 : targetIndex;
        const nextElements = [
          ...remainingElements.slice(0, insertIndex),
          ...movingElements,
          ...remainingElements.slice(insertIndex)
        ];

        if (JSON.stringify(nextElements.map((element) => element.id)) === JSON.stringify(state.layout.elements.map((element) => element.id))) {
          return state;
        }

        return {
          ...state,
          dirty: true,
          historyPast: pushHistory(state),
          historyFuture: [],
          layout: {
            ...state.layout,
            elements: nextElements
          },
          console: appendLog(state, `Reordered ${movingElements.length} object${movingElements.length === 1 ? '' : 's'}`)
        };
      }
    case 'update-element':
      if (!state.layout) {
        return state;
      }

      {
        const nextElements = state.layout.elements.map((element) =>
          element.id === action.id
            ? {
                ...element,
                ...action.patch
              }
            : element
        );
        const currentElement = state.layout.elements.find((element) => element.id === action.id);
        const nextElement = nextElements.find((element) => element.id === action.id);

        if (JSON.stringify(currentElement) === JSON.stringify(nextElement)) {
          return state;
        }

        return {
          ...state,
          dirty: true,
          historyPast: state.historyActive ? state.historyPast : pushHistory(state),
          historyFuture: [],
          layout: {
            ...state.layout,
            elements: nextElements
          }
        };
      }
    case 'update-layer-group-order':
      if (!state.layout) {
        return state;
      }

      {
        const nextElements = state.layout.elements.map((element) =>
          (element.layerGroup ?? 'Default') === action.group
            ? {
                ...element,
                layerOrder: action.layerOrder
              }
            : element
        );

        if (JSON.stringify(nextElements) === JSON.stringify(state.layout.elements)) {
          return state;
        }

        return {
          ...state,
          dirty: true,
          historyPast: state.historyActive ? state.historyPast : pushHistory(state),
          historyFuture: [],
          layout: {
            ...state.layout,
            elements: nextElements
          }
        };
      }
    case 'nudge-elements':
      if (!state.layout || action.ids.length === 0 || (action.dx === 0 && action.dy === 0)) {
        return state;
      }

      {
        const movingIds = new Set(action.ids);
        const nextElements = state.layout.elements.map((element) =>
          movingIds.has(element.id)
            ? {
                ...element,
                x: Math.round(element.x + action.dx),
                y: Math.round(element.y + action.dy)
              }
            : element
        );

        if (JSON.stringify(nextElements) === JSON.stringify(state.layout.elements)) {
          return state;
        }

        return {
          ...state,
          dirty: true,
          historyPast: state.historyActive ? state.historyPast : pushHistory(state),
          historyFuture: [],
          layout: {
            ...state.layout,
            elements: nextElements
          }
        };
      }
    case 'update-asset-path':
      if (!state.layout || action.from === action.to) {
        return state;
      }

      {
        const nextElements = state.layout.elements.map((element) => {
          const patch: Partial<RuntimeElement> = {};
          if (element.src === action.from) {
            patch.src = action.to;
          }
          if (element.sourceAsset === action.from) {
            patch.sourceAsset = action.to;
          }
          return Object.keys(patch).length > 0 ? { ...element, ...patch } : element;
        });

        if (JSON.stringify(nextElements) === JSON.stringify(state.layout.elements)) {
          return state;
        }

        return {
          ...state,
          dirty: true,
          historyPast: pushHistory(state),
          historyFuture: [],
          layout: {
            ...state.layout,
            elements: nextElements
          },
          console: appendLog(state, `Updated asset reference ${action.from} -> ${action.to}`)
        };
      }
    case 'undo':
      {
        const committedState = commitHistoryGroup(state);
        if (!committedState.layout || committedState.historyPast.length === 0) {
          return committedState;
        }

        const previous = committedState.historyPast[committedState.historyPast.length - 1];
        return {
          ...committedState,
          layout: cloneLayout(previous),
          historyPast: committedState.historyPast.slice(0, -1),
          historyFuture: [cloneLayout(committedState.layout), ...committedState.historyFuture].slice(0, 80),
          dirty: true,
          console: appendLog(committedState, 'Undo')
        };
      }
    case 'redo':
      {
        const committedState = commitHistoryGroup(state);
        if (!committedState.layout || committedState.historyFuture.length === 0) {
          return committedState;
        }

        const next = committedState.historyFuture[0];
        return {
          ...committedState,
          layout: cloneLayout(next),
          historyPast: pushHistory(committedState),
          historyFuture: committedState.historyFuture.slice(1),
          dirty: true,
          console: appendLog(committedState, 'Redo')
        };
      }
    case 'save:start':
      return {
        ...state,
        saving: true,
        error: null,
        console: appendLog(state, 'Saving layout JSON')
      };
    case 'save:success':
      return {
        ...state,
        saving: false,
        dirty: false,
        console: appendLog(state, 'Saved current layout JSON')
      };
    case 'save:error':
      return {
        ...state,
        saving: false,
        error: action.error,
        console: appendLog(state, action.error)
      };
    case 'log':
      return {
        ...state,
        console: appendLog(state, action.message)
      };
    case 'clear-console':
      return {
        ...state,
        error: null,
        console: []
      };
    default:
      return state;
  }
}

type EditorStore = {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  selectedElement: RuntimeElement | null;
  selectedElements: RuntimeElement[];
};

const EditorContext = createContext<EditorStore | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const selectedElement =
    state.layout?.elements.find((element) => element.id === state.selectedElementId) ?? null;
  const selectedElements =
    state.layout?.elements.filter((element) => state.selectedElementIds.includes(element.id)) ?? [];

  const value = useMemo(
    () => ({
      state,
      dispatch,
      selectedElement,
      selectedElements
    }),
    [state, selectedElement, selectedElements]
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditorStore() {
  const store = useContext(EditorContext);
  if (!store) {
    throw new Error('useEditorStore must be used inside EditorProvider');
  }

  return store;
}
