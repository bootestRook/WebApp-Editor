# AI Project Workflow

Use WebApp Editor as a framework/engine. App content should live in a separate project folder.

## Clone Setup

After cloning the framework repository:

```powershell
npm install
npm run setup
```

This initializes `.codegraph/` locally for the checkout. Do not commit `.codegraph/`.

## Normal Flow

1. Tell the AI to build under the WebApp Editor framework.
2. Give the AI the WebApp Editor folder path.
3. Give the AI a separate project folder path for the app content.

Example:

```text
Framework: F:\WebApp Editor\webapp-editor
Project: F:\WebApp Projects\Inventory App
```

The AI should edit the project folder first. It should only modify the framework when the requested feature requires an editor/runtime capability that the project protocol cannot express yet.

Do not write logs, temp files, screenshots, or diagnostic output into the WebApp Editor framework root. Use a temp directory or a user-specified artifact path.

## Create A Project

From the WebApp Editor folder:

```powershell
npm run new-project -- "F:\WebApp Projects\Inventory App"
```

This creates:

```text
Inventory App/
  AGENTS.md
  project.webapp.json
  layouts/
    main_page.layout.json
  assets/
  data/
  scripts/
```

## Open A Project

From the WebApp Editor folder:

```powershell
npm run dev:project -- "F:\WebApp Projects\Inventory App"
```

Then open:

- `http://127.0.0.1:5173/editor`
- `http://127.0.0.1:5173/play`

To choose a different port:

```powershell
npm run dev:project -- "F:\WebApp Projects\Inventory App" --port 5174
```

## Validate A Project

From the WebApp Editor folder:

```powershell
npm run validate-project -- "F:\WebApp Projects\Inventory App"
```

Run this after AI changes project files. If validation fails, fix the project data before changing runtime code.

## When To Modify The Framework

Modify `webapp-editor/` only when the project needs a capability missing from the current protocol, such as:

- a new element type
- a new style property
- layout nesting
- behavior scripts
- scene transitions
- export/build packaging

When doing that, update the protocol checklist in `docs/WEBAPP_PROJECT_PROTOCOL.md` and run:

```powershell
npm run validate-project -- "<project-folder>"
npm run build
```
