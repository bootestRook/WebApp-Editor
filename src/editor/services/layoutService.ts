import type { WebAppLayout } from '../../runtime/runtimeTypes';
import { normalizeLayout, parseLayoutSchema } from '../../shared/schema/layoutSchema';

export async function loadLayout(): Promise<WebAppLayout> {
  const response = await fetch('/__webapp_editor/layout');
  if (!response.ok) {
    throw new Error(`Failed to load layout: ${response.status}`);
  }

  return parseLayoutSchema(await response.json());
}

export async function openLayout(layoutPath: string): Promise<WebAppLayout> {
  const response = await fetch('/__webapp_editor/open-layout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ path: layoutPath })
  });

  if (!response.ok) {
    throw new Error(`Failed to open layout: ${response.status}`);
  }

  return loadLayout();
}

export async function saveLayout(layout: WebAppLayout): Promise<void> {
  const normalized = normalizeLayout(layout);
  const response = await fetch('/__webapp_editor/save-layout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(normalized)
  });

  if (!response.ok) {
    throw new Error(`Failed to save layout: ${response.status}`);
  }
}
