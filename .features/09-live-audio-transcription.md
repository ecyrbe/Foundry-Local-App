# 09 Live Audio Transcription

## Goal

Add live microphone transcription with persisted transcript sessions, using locally downloaded audio-capable models.

## Product Direction

This feature should feel parallel to chat, not bolted on as a one-off tool.

That means:

- transcript sessions persist across app restarts like chat sessions
- transcript history lives in the left sidebar alongside chat history
- the sidebar should group session history by mode so users can switch between chat and transcript sessions without adding a separate top-level area just for history
- model loading behavior should stay consistent with chat
- transcript-specific controls and live output belong on a dedicated Transcript page

## SDK And Audio Direction

Keep all Foundry Local SDK and microphone access in the Electron main process.

Use:

- `model.createAudioClient()`
- `audioClient.createLiveTranscriptionSession()`
- `session.start()`
- `session.append()`
- `session.getStream()`
- `session.stop()`
- `naudiodon2` for microphone capture

Audio capture should follow the streaming pattern from `.patterns/foundry-local-sdk-live-transcription-exemple.md`:

- capture PCM microphone input with `naudiodon2`
- feed a bounded append queue into the SDK transcription session
- treat partial and final transcript updates as stream events, not as a reason to stop the session
- cleanly stop audio capture and the SDK session on user stop or app shutdown

## Session Design

Transcript session persistence should be app-owned, just like chat session persistence.

Each transcript session should store:

- id
- title
- selected model id and model name
- created and updated timestamps
- whether the selected model is currently loaded
- persisted transcript entries for the session history
- enough live-session metadata to reopen the session history after capture ends

Initial transcript behavior:

- users can create multiple transcript sessions
- sessions persist across app restarts
- each session is tied to one downloaded audio-capable model
- a transcript session can be reopened after capture stops to review prior transcript output
- if the selected model is no longer downloaded, the session remains visible but starting transcription is blocked until the model is available again

## Navigation And Layout

- add a sidebar accordion or equivalent grouped navigation for session history
- one group is Chat
- one group is Transcript
- each group shows its own session list and create-session action
- the Transcript page is a first-class route, separate from Chat
- Settings remains a first-class route and gains audio configuration

The app-level navigation intent becomes:

- Catalog
- Chat
- Transcript
- Runtime
- Settings

Loaded state should still appear in the global status bar and relevant badges rather than becoming a separate section.

## Requirements

- Transcript page only allows downloaded audio-capable models to be selected
- transcript sessions support create, open, and delete flows
- transcript sessions persist across restarts
- users can start and stop a live transcription session from the Transcript page
- live transcript text updates on screen as streaming results arrive
- transcript history remains visible after the session stops
- model loading and unloading flows match chat behavior where possible
- audio capture failures are shown cleanly in the UI
- users can review transcript session history from the sidebar after capture ends
- Settings includes audio input configuration used by live transcription

## Settings Scope

Settings should expose the audio configuration needed for reliable microphone capture.

Initial scope should support:

- selecting an input device if device enumeration is available through `naudiodon2`
- sample rate, defaulting to the SDK example value of `16000`
- channel count, defaulting to `1`
- bits per sample, defaulting to `16`
- transcription language if supported by the selected model flow

Store these settings in app-owned persistent storage and apply them when a transcript session starts.

## UX Notes

- transcript history can reuse the overall session-list pattern used by chat
- transcript history detail can reuse the same broad layout shape as chat session detail where practical
- the transcript page should visually distinguish live partial text from committed transcript output
- starting transcription should make it obvious which model and microphone configuration are active
- stopping transcription should preserve the final transcript output in the session history

## Initial Scope

- live microphone transcription only
- one active transcription stream at a time
- no file upload transcription yet
- no speaker diarization yet
- no translation mode yet
- no waveform or advanced audio diagnostics yet

## Follow-up Extensions

- transcript export
- rename transcript sessions
- transcript search and filtering
- file-based audio transcription
- translation and multilingual flows
- richer audio diagnostics and input-level monitoring

## Done When

- a user can create and reopen persisted transcript sessions
- a user can select a downloaded audio-capable model for a transcript session
- a user can start and stop live microphone transcription
- live transcript results appear in the Transcript page as audio is streamed
- audio settings are configurable in Settings and used during capture
- the sidebar cleanly separates chat and transcript session histories
