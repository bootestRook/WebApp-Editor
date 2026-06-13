import { EditorApp } from './editor/EditorApp';
import { EditorProvider } from './editor/store/editorStore';
import { RuntimePlayerApp } from './runtime/RuntimePlayerApp';

export default function App() {
  const isEditorRoute = window.location.pathname === '/editor' || window.location.pathname === '/';
  const isPlayerRoute = window.location.pathname === '/play';

  if (isPlayerRoute) {
    return <RuntimePlayerApp />;
  }

  return (
    <EditorProvider>
      {isEditorRoute ? (
        <EditorApp />
      ) : (
        <main className="route-message">
          <h1>WebApp Editor Mode</h1>
          <p>Open /editor to load the active WebApp project.</p>
        </main>
      )}
    </EditorProvider>
  );
}
