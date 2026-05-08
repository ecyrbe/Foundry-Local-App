# AGENTS

## Current State

- This repo is a single Electron app, not a monorepo.
- The only app entrypoints today are `src/main.ts` and `src/preload.ts`.
- The renderer is now a Vite-built React app rooted at `src/renderer/`.
- Routing is handled with `react-router-dom` and must use `HashRouter` because Electron loads the built app from `file://`.

## Commands

- Install deps: `npm install`
- Full build: `npm run build`
- Main-process build only: `npm run build:main`
- Renderer build only: `npm run build:renderer`
- Renderer dev server only: `npm run dev:renderer`
- Run the app: `npm start`

`npm start` always runs `npm run build` first, then launches Electron.

## Build / Wiring Constraints

- `package.json` points Electron at `dist/main.js`.
- `tsconfig.json` compiles only `src/**/*.ts` into `dist/`.
- The renderer HTML entry is root `index.html`, built by Vite into `renderer-dist/`.
- `src/main.ts` loads `../renderer-dist/index.html` directly from disk in production-style runs.
- Renderer TypeScript is under `src/renderer/` and is bundled by Vite, not by `tsc`.
- Vite alias `@` points to `src/renderer`.

## SDK Usage

- Keep Foundry Local SDK usage in the Electron main process.
- Expose a narrow IPC API through `src/preload.ts`; do not import the SDK directly in the renderer.
- The feature roadmap in `.features/README.md` is the source of truth for implementation order.
- Prefer `FoundryLocalManager.createAsync()` for app startup.
- Prefer `ResponsesClient` for the first chat implementation; it has a much stronger type surface than `ChatClient`.

## Dependency Gotcha

- The app currently declares `foundry-local-sdk-winml` in `package.json`, not `foundry-local-sdk` directly.
- `foundry-local-sdk-winml` installs `foundry-local-sdk` transitively and its README says application code still imports from `foundry-local-sdk`.
- If you start importing `foundry-local-sdk` in app code, add it as a direct dependency instead of relying on the transitive install.

## Product Constraints Already Decided

- Loaded models are not a standalone app section.
- Loaded state should appear in a global status bar and as badges where relevant.
- Intended navigation is: Catalog, Downloaded, Chat, Runtime, Settings.

## Frontend Stack

- UI stack is React + React Router + Vite + Tailwind CSS v4 + shadcn/ui.
- Keep adding UI under `src/renderer/`; do not put renderer code back into `static/`.
- `components.json` is present for shadcn/ui configuration.
- Prefer adding reusable UI primitives under `src/renderer/components/ui/` and shared helpers under `src/renderer/lib/`.
- When creating or revising interfaces, prefer reusable shadcn/ui-style components over ad hoc page-local markup so the UI can be composed from shared primitives.

## Verification Expectations

- There is currently no test, lint, or formatter setup in this repo.
- The only verified project-level check today is `npm run build`.
- Do not run `npm start` from the agent unless the user explicitly asks for it in that turn; it blocks the OpenCode interface. Ask the user to run it manually when an Electron runtime check is needed.
- After structural changes to startup or window wiring, ask the user to run `npm start` manually to catch Electron/runtime issues that `tsc` will miss.
