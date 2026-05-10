# 10 Streaming Markdown Chat Rendering

## Goal

Render assistant chat messages as Markdown, including syntax-highlighted fenced code blocks, while preserving a stable live rendering experience during streaming.

## Problem

The chat page currently renders message content as plain text. This makes fenced code blocks hard to read and causes streamed Markdown responses to remain visually raw even when the model is clearly emitting structured Markdown.

Streaming adds one extra challenge: fenced code blocks often arrive before their closing triple backticks. A naive Markdown renderer may keep the content as plain text until the closing fence arrives, causing the UI to jump late.

## Requirements

- assistant messages render as full Markdown
- user messages remain plain text
- fenced code blocks render with syntax highlighting when a language is present
- unfinished fenced code blocks should still render as code blocks while the assistant is streaming
- the app must not mutate stored message content just to support temporary rendering
- markdown rendering should be safe by default and should not enable raw HTML injection
- the streaming experience should remain smooth on long messages

## Recommended Approach

Use `react-markdown` for assistant message rendering with a custom code renderer.

During streaming, derive a temporary display string from the stored assistant message content:

- detect whether the Markdown currently has an unmatched triple-backtick fence
- if so, append a synthetic closing fence for rendering only
- once the real closing fence arrives, render the raw content unchanged

This keeps storage simple while making in-progress code blocks render correctly.

## Dependencies

- `react-markdown`
- a lightweight syntax-highlighting dependency compatible with React rendering

## UI Notes

- preserve the existing chat bubble layout
- style prose elements so paragraphs, lists, inline code, and headings fit the current app theme
- code blocks should scroll horizontally if needed rather than stretching the layout
- the in-progress assistant message should use the same Markdown renderer as completed assistant messages

## Done When

- assistant responses render as Markdown in the chat page
- fenced code blocks are highlighted and readable
- an open fenced block renders as code during streaming even before the closing fence arrives
- completed messages still match their stored source text exactly
- `npm run build` succeeds
