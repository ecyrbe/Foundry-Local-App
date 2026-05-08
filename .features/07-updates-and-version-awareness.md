# 07 Updates And Version Awareness

## Goal

Help users understand when a locally cached model is no longer the newest catalog version.

## SDK APIs

- `manager.catalog.getLatestVersion(model)`

## Requirements

- compare downloaded models against latest catalog versions
- show when an update is available
- distinguish clearly between:
- installed version
- latest available version
- allow users to navigate from an outdated downloaded model to the newer catalog entry

## UX Notes

- keep update state lightweight at first
- badge and details text are enough
- actual upgrade workflow can reuse the existing download flow

## Done When

- outdated local models are visible to the user
- the app can surface whether a newer version exists in the catalog
