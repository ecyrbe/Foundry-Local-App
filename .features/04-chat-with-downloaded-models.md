# 04 Chat With Downloaded Models

## Goal

Provide a chat interface that only allows locally available models to be selected.

## Recommended SDK Direction

Use `ResponsesClient` first.

Why:

- it has a much stronger type surface than `ChatClient`
- it fits a simple request-response UI well
- it can later support streaming and structured output without redesigning the page

## SDK APIs

- `manager.startWebService()`
- `manager.createResponsesClient(modelId)`
- `ResponsesClient.create()`
- `ResponsesClientSettings`
- `getOutputText(response)`
- `manager.catalog.getCachedModels()`
- optionally `IModel.load()` before first inference

## Requirements

- Chat page model picker only includes downloaded models
- if needed, auto-load the model before the first request, or require explicit load
- support a simple single-threaded chat history UI
- show model responses as plain text first
- show request-in-progress state
- show error state cleanly

## Initial Scope

- non-streaming responses first
- plain text output first
- no tool-calling UI yet
- no audio yet

## Follow-up Extensions

- streaming responses with `createStreaming()`
- structured output modes
- response history persistence

## Done When

- a user can select a downloaded model
- a user can send a prompt and receive a response
- the page handles missing model state and model errors gracefully
