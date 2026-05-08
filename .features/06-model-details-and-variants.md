# 06 Model Details And Variants

## Goal

Expose richer model metadata and allow explicit variant selection where a model has multiple variants.

## SDK APIs

- `IModel.variants`
- `IModel.selectVariant(variant)`
- `IModel.info`
- `manager.catalog.getModel(alias)`
- `manager.catalog.getModelVariant(modelId)`

## Requirements

- add a model details view or drawer from Catalog and Downloaded
- show extended metadata including:
- publisher
- provider type
- runtime device / execution provider if available
- max output tokens
- capabilities
- prompt template if useful to expose
- list all variants for a model
- let users select the active variant for operations on that model

## UX Notes

- variant selection matters most before download and before chat
- keep the base Catalog page lighter; use this details view for deeper inspection

## Done When

- a user can inspect a model in detail
- a user can understand available variants
- a user can select the variant they want to use
