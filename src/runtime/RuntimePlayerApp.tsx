import { useEffect, useMemo, useState } from 'react';
import { parseLayoutSchema } from '../shared/schema/layoutSchema';
import { parseProjectSchema } from '../shared/schema/projectSchema';
import { BASE_RESOLUTION, type WebAppLayout, type WebAppProject } from './runtimeTypes';
import { RuntimeRenderer } from './RuntimeRenderer';

type LoadState =
  | {
      status: 'loading';
      project: null;
      layout: null;
      error: null;
    }
  | {
      status: 'ready';
      project: WebAppProject;
      layout: WebAppLayout;
      error: null;
    }
  | {
      status: 'error';
      project: null;
      layout: null;
      error: string;
    };

function useWindowSize() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));

  useEffect(() => {
    const updateSize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  return size;
}

async function fetchJson(path: string) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

export function RuntimePlayerApp() {
  const viewport = useWindowSize();
  const [state, setState] = useState<LoadState>({
    status: 'loading',
    project: null,
    layout: null,
    error: null
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [projectJson, layoutJson] = await Promise.all([
          fetchJson('/__webapp_editor/project'),
          fetchJson('/__webapp_editor/layout')
        ]);
        const project = parseProjectSchema(projectJson);
        const layout = parseLayoutSchema(layoutJson);
        if (!cancelled) {
          setState({
            status: 'ready',
            project,
            layout,
            error: null
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            project: null,
            layout: null,
            error: error instanceof Error ? error.message : 'Failed to load runtime project'
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const resolution = state.project?.baseResolution ?? BASE_RESOLUTION;
  const scale = useMemo(
    () => Math.min(viewport.width / resolution.width, viewport.height / resolution.height),
    [resolution.height, resolution.width, viewport.height, viewport.width]
  );

  if (state.status === 'error') {
    return (
      <main className="route-message">
        <h1>Runtime Load Failed</h1>
        <p>{state.error}</p>
      </main>
    );
  }

  return (
    <main className="runtime-player">
      {state.status === 'ready' ? (
        <div
          className="runtime-player-surface"
          style={{
            width: resolution.width * scale,
            height: resolution.height * scale
          }}
        >
          <div
            className="runtime-player-canvas"
            style={{
              width: resolution.width,
              height: resolution.height,
              transform: `scale(${scale})`
            }}
          >
            <RuntimeRenderer
              assetBaseUrl="/__webapp_editor/assets"
              layout={state.layout}
              viewportWidth={resolution.width}
              viewportHeight={resolution.height}
            />
          </div>
        </div>
      ) : (
        <div className="runtime-player-loading">Loading</div>
      )}
    </main>
  );
}
