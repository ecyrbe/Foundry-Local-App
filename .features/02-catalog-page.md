# 02 Catalog Page

## Goal

Show all available models from the Foundry Local catalog, let users inspect their basic metadata, and manage downloaded state directly from the same page.

## SDK APIs

- `manager.catalog.getModels()`
- `IModel.info`
- `IModel.isCached`
- `IModel.isLoaded()`

## Requirements

- fetch and display all available catalog models
- fetch catalog data from the Electron main process via IPC backed by `FoundryLocalManager.catalog`
- show at minimum:
- alias
- display name or name
- version
- model type
- task
- file size if available
- input modalities
- output modalities
- context length
- supports tool calling if available
- show status badges for:
- available
- downloaded
- loaded
- allow filtering the catalog to downloaded models only via a toggle control in the page toolbar
- allow downloading directly from each model card
- allow remove-from-cache directly from each downloaded model card
- allow refresh of the catalog

## UX Notes

- this page should feel like the primary inventory view
- this page is also the downloaded-models view when the downloaded-only filter is enabled
- loaded state appears here as a badge and is also reflected in the global status bar
- do not force users into a separate downloaded-models page
- build this page with the existing React Router app shell and shared shadcn/ui primitives
- remove the bootstrap overview card once real catalog content is present so Catalog becomes the primary landing content

## Done When

- a user can open Catalog and browse the available models
- each entry shows enough metadata to decide whether to download it
- a user can switch to a downloaded-only filter without leaving the Catalog page
- a user can download or remove a model directly from its catalog card
- downloaded and loaded states are clearly visible
