# 08 Structured Output Playground

## Goal

Add a higher-value advanced feature that takes advantage of the typed Responses API.

## Why This Feature

The SDK's `ResponsesClient` exposes stronger typing than the chat/audio/embedding clients. This makes a structured-output playground a good advanced feature once the basic chat flow works.

## SDK APIs

- `ResponsesClient.create()`
- `ResponsesClient.createStreaming()`
- `ResponsesClientSettings`
- `ResponseCreateParams`
- `TextConfig`
- `TextFormat`
- `FunctionToolDefinition`
- `ResponseToolChoice`

## Requirements

- add an advanced mode to Chat or a separate playground page
- allow user-defined response formatting options
- optionally allow JSON-schema-based outputs
- display raw response object for debugging
- optionally support streaming mode

## Scope Control

- do not implement this before the normal chat flow is stable
- do not build a full tool-calling workflow yet unless it becomes necessary

## Done When

- advanced users can experiment with structured outputs locally
- the app demonstrates value beyond a plain text chat shell
