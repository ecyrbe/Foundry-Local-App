# 04 Chat With Downloaded Models

## Goal

Provide a chat interface that only allows locally available models to be selected.

## Recommended SDK Direction

Use `ResponsesClient` first.

Why:

- it has a much stronger type surface than `ChatClient`
- it fits a simple request-response UI well
- it can later support streaming and structured output without redesigning the page

## Session Design

The app should provide ChatGPT-style chat sessions in the product UI, but session persistence should be owned by the app rather than delegated to the SDK.

Why:

- the SDK exposes `ResponsesClient.create()` and `previous_response_id`, but it does not expose a first-class local session/thread abstraction for desktop app state
- `ResponsesClient` can store and retrieve responses, but the app still needs its own durable session list, titles, selected model, and message history
- owning session persistence in the Electron main process keeps renderer state simple and survives app restarts predictably

Initial session behavior:

- users can create multiple chat sessions
- sessions persist across app restarts
- each session is tied to one downloaded model
- each session stores plain-text user/assistant turns and timestamps
- the app may store the latest `response.id` from `ResponsesClient` for future chaining, but the session transcript in app storage remains the source of truth
- if the selected model is no longer downloaded, the session remains visible but sending is blocked until the model is available again

## SDK APIs

- `manager.startWebService()`
- `manager.createResponsesClient(modelId)`
- `ResponsesClient.create()`
- `ResponseCreateParams.previous_response_id`
- `ResponsesClientSettings`
- `getOutputText(response)`
- `manager.catalog.getCachedModels()`
- optionally `IModel.load()` before first inference

## Requirements

- Chat page model picker only includes downloaded models
- if needed, auto-load the model before the first request, or require explicit load
- support multiple persisted chat sessions
- session list persists across app restarts
- support a standard single-threaded message history within each session
- show model responses as plain text first
- show request-in-progress state
- show error state cleanly

## Initial Scope

- non-streaming responses first
- plain text output first
- no tool-calling UI yet
- no audio yet
- session titles can be simple and app-generated first

## Follow-up Extensions

- streaming responses with `createStreaming()`
- structured output modes
- richer session naming, rename, and delete flows
- deeper SDK response retrieval for debugging and replay

## Done When

- a user can create and reopen persisted chat sessions
- a user can select a downloaded model for a session
- a user can send a prompt and receive a response in the active session
- the page handles missing model state and model errors gracefully
