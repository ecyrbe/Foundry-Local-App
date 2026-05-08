# 05 Runtime And Web Service

## Goal

Expose the local runtime state that matters for operating Foundry Local reliably on desktop.

## SDK APIs

- `manager.isWebServiceRunning`
- `manager.startWebService()`
- `manager.stopWebService()`
- `manager.urls`
- `manager.discoverEps()`
- `manager.downloadAndRegisterEps()`

## Requirements

- Runtime page shows whether the web service is running
- allow starting and stopping the web service
- show the bound URLs when running
- list discoverable execution providers
- show whether each EP is registered
- allow EP download and registration
- show EP download progress if implemented in the selected flow

## Why This Matters

- this app is meant to expose Foundry Local features, not only consume them internally
- runtime visibility helps users understand local serving and acceleration setup

## UX Notes

- status bar should also reflect web service running or stopped
- this page is operational, not end-user chat focused

## Done When

- a user can inspect local runtime state
- a user can start/stop the web service
- a user can discover and install execution providers
