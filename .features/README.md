# Foundry Local App Feature Roadmap

This directory stores the implementation plan for the Electron app so work can resume cleanly in future sessions.

## Product Goal

Expose selected `foundry-local-sdk` capabilities through a desktop UI.

Current intended scope:

- browse the catalog of models
- download models
- chat with locally downloaded models
- show loaded state as a global status bar, not as a separate app section

## Implementation Order

1. `01-app-shell-and-sdk-bootstrap.md`
2. `02-catalog-page.md`
3. `03-downloaded-models-and-status.md`
4. `04-chat-with-downloaded-models.md`
5. `05-runtime-and-web-service.md`
6. `06-model-details-and-variants.md`
7. `07-updates-and-version-awareness.md`
8. `08-structured-output-playground.md`

## Notes

- Keep `foundry-local-sdk` usage in the Electron main process.
- Expose only a narrow IPC surface to the renderer.
- The renderer stack is React + React Router + Vite + Tailwind CSS v4 + shadcn/ui.
- The renderer must support predefined light and dark themes, default to the current system theme, and allow a user override from Settings.
- Because the app loads from `file://`, router work should use `HashRouter`, not `BrowserRouter`.
- Prefer `FoundryLocalManager.createAsync()` during app startup.
- Prefer `ResponsesClient` for the first chat implementation because it has the strongest type surface.
- Downloaded models should be managed from the Catalog page via filters and per-model actions, not from a separate navigation page.
- Loaded models should be surfaced in a persistent status area and relevant badges, not as a dedicated navigation page.
