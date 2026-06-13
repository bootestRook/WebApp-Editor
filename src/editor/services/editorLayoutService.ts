export async function loadEditorDockLayout(): Promise<unknown | null> {
  if (import.meta.env.PROD) {
    return null;
  }

  const response = await fetch('/__webapp_editor/editor-layout');
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { layout?: unknown };
  return data.layout ?? null;
}

export async function saveEditorDockLayout(layout: unknown): Promise<void> {
  if (import.meta.env.PROD) {
    return;
  }

  const response = await fetch('/__webapp_editor/editor-layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(layout)
  });
  if (!response.ok) {
    throw new Error(`Failed to save editor layout: ${response.status}`);
  }
}
