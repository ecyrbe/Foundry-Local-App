# <img src="./build/icon.svg" alt="F" width="64" height="64" align="center" />oundry Local App

[![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Release Workflow](https://img.shields.io/badge/release-msix%20workflow-available-2563EB)](./.github/workflows/release-msix.yml)
[![License](https://img.shields.io/badge/license-MIT-111827)](./LICENSE)

Desktop UI for browsing, downloading, loading, and chatting with local models through the Microsoft Foundry Local SDK.

Foundry Local App packages the SDK behind a native Electron shell and a modern React renderer, keeping all Foundry SDK access in the Electron main process and exposing a narrow IPC layer to the UI.

## Overview

- Browse the local Foundry model catalog with rich metadata.
- Download, remove, load, and unload models from the same Catalog experience.
- Manage persisted chat sessions backed by downloaded local models.
- Render Chat assistant responses as Markdown with syntax-highlighted code blocks and one-click copy actions.
- Capture live local audio transcription with persisted transcript sessions and audio settings.
- Inspect runtime status, web service state, and execution provider registration.
- Package the app for Windows and publish signed `.msix` releases with GitHub Actions.

## Screenshots

### Chat

Run local conversations against downloaded models with persistent session history, clear model state, and richer response rendering.

Chat highlights:

- 💬 Persistent local chat sessions
- 📝 Assistant responses rendered as Markdown
- 🎨 Syntax-highlighted fenced code blocks
- 📋 One-click copy for generated code blocks

![Chat view](./docs/chat.png)

### Transcript

Transcribe live microphone audio with local audio-capable models while keeping a dedicated transcript history.

Transcript highlights:

- 🎙️ Live microphone transcription with local models
- 🫧 Separate live preview text during active capture
- 🗂️ Persistent transcript sessions and history
- ⚙️ Quick access to model state and audio settings

![Transcript view](./docs/transcript.png)

### Catalog

Browse the local model catalog, filter to downloaded models, and manage the full model lifecycle from one place.

Catalog highlights:

- 🔎 Rich model discovery and filtering
- 📦 Downloaded-model management in one view
- ▶️ Load and unload actions with clear status
- 🧾 Metadata for model capabilities and variants

![Catalog view](./docs/catalog.png)

### Settings And Runtime

Control the app experience and local runtime from a single administration surface.

Settings and Runtime highlights:

- 🌗 Theme preference controls
- 🌐 Embedded web service start and stop controls
- 🧩 Execution provider registration and status
- 🎛️ Runtime and audio configuration in one place

![Settings and runtime view](./docs/settings.png)

## Tech Stack

- Electron
- React 19
- React Router with `HashRouter`
- Vite
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- `foundry-local-sdk`

## Project Structure

```text
.
|- src/main.ts                 Electron main process entry
|- src/preload.ts              Preload and IPC bridge
|- src/renderer/               React renderer app
|- docs/                       README screenshots
|- build/                      App icon sources
|- scripts/                    Packaging and asset generation scripts
|- electron-builder.config.mjs Windows packaging config
`- .github/workflows/          CI and release automation
```

## Getting Started

### Prerequisites

- Windows 11 or Windows 10 with Foundry Local SDK prerequisites installed
- Node.js 22+
- npm 10+

### Install

```bash
npm install
```

### Run The App

```bash
npm start
```

This builds the Electron main process and the Vite renderer, then launches the desktop app.

## Available Scripts

```bash
npm run build              # Build main and renderer bundles
npm run build:main         # Build Electron main/preload only
npm run build:renderer     # Build renderer only
npm run dev:renderer       # Run the Vite renderer dev server
npm run assets:icons       # Generate Windows and MSIX icon assets
npm run dist:win:unpacked  # Build a packaged unpacked Windows app
npm run dist:win:msix      # Build an MSIX package from the Electron app
```

## Architecture Notes

- The renderer never imports `foundry-local-sdk` directly.
- Foundry Local SDK state lives in the Electron main process.
- The renderer consumes serialized state over IPC through `src/preload.ts`.
- Routing uses `HashRouter` because the renderer is loaded from `file://`.
- The current product flow centers on Catalog, Chat, Transcript, Runtime, and Settings.

## Building Windows Packages

### Unpacked Electron App

```bash
npm run dist:win:unpacked
```

Output:

- `release/win-unpacked/`

### MSIX Package

```bash
npm run dist:win:msix
```

Output:

- `release/*.msix`

The MSIX flow does the following:

1. Generates branded Windows icon assets.
2. Builds the Electron app into `release/win-unpacked`.
3. Creates an MSIX manifest and package using the Windows SDK `makeappx.exe` tool.
4. Signs the package with `signtool.exe` when certificate secrets are available.

## GitHub Release Pipeline

This repository includes a Windows release workflow at `.github/workflows/release-msix.yml`.

It runs when a tag matching `v*` is pushed and will:

1. Install dependencies.
2. Build the Electron app.
3. Generate a signed `.msix` artifact.
4. Upload the `.msix` to the corresponding GitHub Release.

### Required GitHub Configuration

Secrets:

- `APPX_PUBLISHER`
- `WINDOWS_CERT_BASE64`
- `WINDOWS_CERT_PASSWORD`

Repository variables:

- `APPX_IDENTITY_NAME`
- `APPX_APPLICATION_ID`
- `APPX_PUBLISHER_DISPLAY_NAME`

`APPX_PUBLISHER` must match the certificate subject used to sign the MSIX package.

## Product Scope

Implemented or actively targeted:

- Catalog browsing and local model management
- Downloaded-model filtering and loaded-state badges
- Persisted local chat sessions
- Markdown chat rendering with syntax-highlighted code blocks and easy copy/paste
- Live audio transcription with persisted transcript sessions
- Runtime and web service controls
- Execution provider discovery and registration

Planned follow-up work includes:

- model details and variants
- update and version awareness
- structured output playground

The implementation roadmap lives in `.features/README.md`.

## Development Notes

- There is currently no dedicated lint or test pipeline in this repo.
- The primary project-level verification command is `npm run build`.
- For packaging validation, use `npm run dist:win:msix` on Windows.

## License

MIT
