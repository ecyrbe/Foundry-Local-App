# 03 Downloaded Models And Status

## Goal

Let users manage local model availability from the Catalog page and see load state clearly in both model cards and the global status area.

## SDK APIs

- `IModel.download(progress => ...)`
- `manager.catalog.getCachedModels()`
- `IModel.load()`
- `IModel.unload()`
- `IModel.removeFromCache()`
- `manager.catalog.getLoadedModels()`

## Requirements

- allow downloading from Catalog
- allow filtering Catalog to locally cached models only with a toggle control
- show in-progress download percentage
- refresh catalog model state after completion
- allow load and unload actions for downloaded models
- allow remove-from-cache action for downloaded models
- keep global loaded-model count updated in the status bar

## UX Notes

- Catalog is the primary inventory and local-library view
- Loaded is not its own page
- loaded state should be visible as:
- badge on model cards/rows
- count in the global status bar
- optional quick status text in the Catalog page header when downloaded-only filtering is enabled

## State Notes

- after any download/load/unload/remove action, refresh relevant model state
- keep view models stable and simple for the renderer

## Done When

- a user can download a model from the catalog
- a user can filter Catalog to see local models only
- a user can load and unload downloaded models
- the status bar always reflects the current loaded count
