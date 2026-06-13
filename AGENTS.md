# WebApp Editor Framework Instructions

This folder is the WebApp Editor framework, not an individual app project.

Keep this framework root clean. Do not create `.log`, `.tmp`, `.pid`, scratch output, screenshots, generated reports, or one-off diagnostic files in this directory. Use the OS temp directory for diagnostics, or an explicit external artifact path requested by the user.

Normal app work should happen in a separate project folder created with:

```powershell
npm run new-project -- "<project-folder>"
```

Open a project with:

```powershell
npm run dev:project -- "<project-folder>"
```

Validate a project with:

```powershell
npm run validate-project -- "<project-folder>"
```

Only modify framework source when the requested app cannot be represented by the existing project protocol. If the protocol changes, update these together:

- `src/shared/schema/projectContract.ts`
- `src/runtime/runtimeTypes.ts`
- `src/shared/schema/*.ts`
- `src/runtime/RuntimeElementRenderer.tsx`
- `src/editor/panels/*`
- `scripts/validate-project.mjs`
- `docs/WEBAPP_PROJECT_PROTOCOL.md`

Read `docs/AI_PROJECT_WORKFLOW.md` before guiding an AI-authored project.

Before finishing framework work, run:

```powershell
npm run check-root
npm run build
```
