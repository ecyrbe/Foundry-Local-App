# 01 App Shell And SDK Bootstrap

## Goal

Create the first usable Electron app shell and establish the main-process integration point with `foundry-local-sdk`.

This now means building on the React renderer already set up under `src/renderer/`, not creating a new renderer stack.

## Why First

Everything else depends on a stable app startup flow, a singleton SDK manager, and a clean IPC boundary.

## Requirements

- initialize `FoundryLocalManager` once in the Electron main process
- use `FoundryLocalManager.createAsync()`
- choose and document the app configuration used at startup
- keep the renderer on React Router with `HashRouter`
- use Tailwind and shadcn/ui components for the shell instead of ad hoc raw HTML
- support predefined light and dark themes in the renderer
- default the active theme to the current system preference until the user picks an override
- expose a theme switch in Settings so the user can override the system theme
- expose IPC methods for:
- app initialization status
- SDK readiness status
- basic error reporting
- render a basic app layout with navigation placeholders
- include a global status bar area at the bottom or top of the window

## UI Expectations

- navigation for Catalog, Chat, Runtime, Settings
- Settings includes theme controls for System, Light, and Dark
- status bar shows:
- SDK ready or failed
- web service running or stopped
- loaded model count

## Technical Notes

- do not import the SDK directly in the renderer
- keep SDK objects in main process memory
- expose only serializable view models over IPC
- establish one source of truth for app state in main
- renderer code lives in `src/renderer/` and is bundled by Vite into `renderer-dist/`
- prefer CSS variable theme tokens for light and dark mode instead of ad hoc component-level color overrides

## Done When

- the app opens with navigation and empty pages
- the SDK initializes successfully from main process
- the renderer can query startup status
- the status bar shows at least placeholder counts and service state
- the renderer follows the system light or dark theme by default
- the Settings page can switch between System, Light, and Dark and the selection persists across reloads
