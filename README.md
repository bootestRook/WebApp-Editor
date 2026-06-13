# WebApp Editor

WebApp Editor is the editor framework. App projects should live in separate folders and be opened with `dev:project`.

## Clone Setup

After cloning:

```powershell
npm install
npm run setup
```

`npm run setup` initializes the local CodeGraph index for this checkout. The generated `.codegraph/` directory is ignored by Git.

If CodeGraph is not available on `PATH`, install or expose the `codegraph` command and then run:

```powershell
npm run codegraph:init
```

## Project Workflow

Double-click launcher on Windows:

```text
WebApp Editor.cmd
```

The launcher starts the editor at `http://127.0.0.1:5173/editor`. Use Open Project inside the editor, or run `dev:project` for a specific external project folder.

Create an external app project:

```powershell
npm run new-project -- "F:\WebApp Projects\My App"
```

Open it in the editor:

```powershell
npm run dev:project -- "F:\WebApp Projects\My App"
```

Validate it:

```powershell
npm run validate-project -- "F:\WebApp Projects\My App"
```

## Framework Checks

```powershell
npm run check-root
npm run build
```

The framework root must stay clean. Do not write logs, temp files, screenshots, generated reports, or app project files beside `package.json`.
