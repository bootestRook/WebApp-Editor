# WebApp Project Protocol

This protocol keeps AI-authored projects editable in WebApp Editor and runnable through the shared runtime. Project content should be structured data first, with engine source changes reserved for new editor/runtime capabilities.

WebApp Editor is the framework. Individual apps can live in separate project folders anywhere on disk.

The framework root should stay clean. Generated logs and temporary diagnostics must not be written beside `package.json`.

## Project Layout

```text
my-project/
  project.webapp.json
  layouts/
    main_page.layout.json
  assets/
    images/
    components/
  scripts/
  data/
```

`scripts/` and `data/` are reserved for later behavior and data systems. The current protocol validates the manifest, layouts, component assets, and asset references.

## Manifest

`project.webapp.json` must use protocol version `1`.

```json
{
  "engine": "webapp-editor",
  "version": 1,
  "name": "My WebApp",
  "baseResolution": {
    "width": 1920,
    "height": 1080
  },
  "entryLayout": "layouts/main_page.layout.json",
  "assetsRoot": "assets"
}
```

Paths are normalized project-relative paths. Use `/`, never `\`, absolute paths, `.` segments, or `..` segments.

The default project base resolution is `1920x1080`. The editor can switch the project base resolution in Project settings to one of the built-in supported sizes: `1920x1080`, `2560x1440`, `1280x720`, `1366x1024`, `2340x1080`, `1080x1920`, `1080x2340`, or `1024x1366`.

## Layouts

Layouts are scene documents. The editor and runtime both consume the same layout JSON.

```json
{
  "id": "main_page",
  "name": "Main Page",
  "baseResolution": {
    "width": 1920,
    "height": 1080
  },
  "elements": []
}
```

Supported element types are currently:

- `panel`
- `text`
- `button`
- `image`

Each element needs a stable unique `id`, `type`, `name`, `x`, `y`, `width`, and `height`. Element IDs must start with a letter and can contain letters, numbers, `_`, or `-`.

Elements may set `rotation` as a number of degrees around the element center. `0` or an omitted value means no rotation; positive values rotate clockwise.

## Styles

The current style surface is intentionally small:

- `fill`
- `color`
- `borderColor`
- `borderWidth`
- `radius`
- `fontSize`
- `fontWeight`
- `textAlign`: `left`, `center`, `right`
- `fit`: `cover`, `contain`, `fill`

AI authors should not invent style keys. Add new style keys to the editor protocol only when the runtime renderer, inspector, schema, validator, and docs are updated together.

## Component Assets

Reusable component assets live under `assets/**` and use the suffix `.component.webapp.json`.

```json
{
  "version": 1,
  "kind": "component",
  "name": "Primary Button",
  "element": {
    "id": "primary_button",
    "type": "button",
    "name": "Primary Button",
    "x": 0,
    "y": 0,
    "width": 320,
    "height": 88,
    "text": "Continue"
  }
}
```

## Runtime

`/editor` opens the full editor. `/play` opens a runtime-only player for the active project. The player uses the same project manifest, layout schema, and `RuntimeRenderer` as the editor GameView.

Open a specific external project from the editor folder:

```powershell
npm run dev:project -- "F:\WebApp Projects\Inventory App"
```

## Extension Checklist

When adding a new editor/runtime feature, update these in the same change:

- Contract constants in `src/shared/schema/projectContract.ts`.
- Runtime TypeScript types in `src/runtime/runtimeTypes.ts`.
- Schema parsing and normalization in `src/shared/schema/*.ts`.
- Runtime rendering in `src/runtime/RuntimeElementRenderer.tsx`.
- Inspector and creation UI in `src/editor/panels`.
- Project validator in `scripts/validate-project.mjs`.
- This protocol document.

Then run:

```powershell
npm run validate-project -- "<project-folder>"
npm run build
```
