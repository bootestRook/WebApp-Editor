import { Trash2, TerminalSquare } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

export function ConsolePanel() {
  const { state, dispatch } = useEditorStore();

  return (
    <section className="panel console-panel">
      <div className="panel-title">
        <TerminalSquare size={16} />
        <span>Console</span>
        <button
          className="panel-title-icon-button"
          type="button"
          title="Clear Console"
          onClick={() => dispatch({ type: 'clear-console' })}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="console-lines">
        {state.console.map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
        {state.error ? <div className="console-error">{state.error}</div> : null}
      </div>
    </section>
  );
}
