# Foundry Local SDK API Reference

This document summarizes the public API exposed by `foundry-local-sdk` based only on the TypeScript declaration files in `node_modules/foundry-local-sdk/dist`.

## Module Entry Point

`foundry-local-sdk` exports these public entry points from `dist/index.d.ts`:

- `FoundryLocalManager`
- `Catalog`
- `FoundryLocalConfig` (type)
- `IModel` (type)
- `ChatClient`, `ChatClientSettings`
- `AudioClient`, `AudioClientSettings`
- `EmbeddingClient`
- `LiveAudioTranscriptionSession`, `LiveAudioTranscriptionOptions`
- `LiveAudioTranscriptionResponse`, `TranscriptionContentPart` (types)
- `ResponsesClient`, `ResponsesClientSettings`, `getOutputText`
- `ModelLoadManager`
- everything re-exported from `types.d.ts`

The package also exports some `@internal` classes (`Model`, `ModelVariant`, `CoreInterop`, `Configuration`), but those are marked internal in the declarations and should not be treated as stable application-facing APIs.

## Initialization

### `FoundryLocalConfig`

Configuration object passed to `FoundryLocalManager.create()` or `createAsync()`.

```ts
interface FoundryLocalConfig {
  appName: string;
  appDataDir?: string;
  modelCacheDir?: string;
  logsDir?: string;
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  webServiceUrls?: string;
  serviceEndpoint?: string;
  libraryPath?: string;
  additionalSettings?: { [key: string]: string };
}
```

Fields:

- `appName`: required. Used for logs and telemetry.
- `appDataDir`: optional application data root. Default is `{user_home}/.{appName}`.
- `modelCacheDir`: optional model cache directory. Default is `{appDataDir}/cache/models`.
- `logsDir`: optional log directory. Default is `{appDataDir}/logs`.
- `logLevel`: optional log verbosity. Default is `'warn'`.
- `webServiceUrls`: optional bind address list for the local web service. Multiple URLs are semicolon-delimited.
- `serviceEndpoint`: optional external service URL when connecting to a separately running service.
- `libraryPath`: optional directory containing the native Foundry Local core binaries.
- `additionalSettings`: optional string map passed through to core. Declared as internal-use-oriented.

### `FoundryLocalManager`

Primary SDK entry point. Manages core initialization, model catalog access, execution provider management, and web service startup.

```ts
class FoundryLocalManager {
  static create(config: FoundryLocalConfig): FoundryLocalManager;
  static createAsync(config: FoundryLocalConfig): Promise<FoundryLocalManager>;

  get catalog(): Catalog;
  get urls(): string[];
  get isWebServiceRunning(): boolean;

  startWebService(): void;
  stopWebService(): void;

  discoverEps(): EpInfo[];

  downloadAndRegisterEps(): Promise<EpDownloadResult>;
  downloadAndRegisterEps(names: string[]): Promise<EpDownloadResult>;
  downloadAndRegisterEps(progressCallback: (epName: string, percent: number) => void): Promise<EpDownloadResult>;
  downloadAndRegisterEps(names: string[], progressCallback: (epName: string, percent: number) => void): Promise<EpDownloadResult>;

  createResponsesClient(modelId?: string): ResponsesClient;
}
```

Behavior notes from the declarations:

- `create()` is synchronous and explicitly notes that it blocks the event loop during initialization.
- `createAsync()` performs native command execution asynchronously to avoid blocking during initialization, although some synchronous setup still occurs before the first `await`.
- `catalog` returns the singleton manager's `Catalog` instance.
- `urls` returns the current bound web service URLs, or an empty array if the service is not running.
- `startWebService()` starts the embedded local web service. If no listener is configured, it defaults to `127.0.0.1:0`, meaning the OS picks an ephemeral port.
- `stopWebService()` stops the web service.
- `isWebServiceRunning` reports current web service state.
- `discoverEps()` lists discoverable execution providers.
- `downloadAndRegisterEps()` supports overloads for all EPs, specific EP names, optional progress reporting, or both.
- `createResponsesClient()` requires the web service to already be running.

## Catalog and Model Discovery

### `Catalog`

Represents the available model catalog.

```ts
class Catalog {
  constructor(coreInterop: CoreInterop, modelLoadManager: ModelLoadManager, catalogName?: string);

  get name(): string;
  getModels(): Promise<IModel[]>;
  getModel(alias: string): Promise<IModel>;
  getModelVariant(modelId: string): Promise<IModel>;
  getCachedModels(): Promise<IModel[]>;
  getLoadedModels(): Promise<IModel[]>;
  getLatestVersion(modelOrModelVariant: IModel): Promise<IModel>;
}
```

Key semantics:

- `getModels()` returns all available catalog models.
- `getModel(alias)` looks up a model by alias and returns an `IModel` representing the model and its variants.
- `getModelVariant(modelId)` looks up a specific model variant ID and returns an `IModel` containing only that variant.
- `getCachedModels()` returns locally cached models.
- `getLoadedModels()` returns currently loaded models.
- `getLatestVersion()` compares a model or variant against the catalog and returns the latest available version.

Validation and errors noted in the declarations:

- `getModel(alias)` throws if `alias` is null, undefined, or empty.
- `getModelVariant(modelId)` throws if `modelId` is null, undefined, or empty.

### `IModel`

Common model interface returned by the catalog and used by concrete model implementations.

```ts
interface IModel {
  get id(): string;
  get alias(): string;
  get info(): ModelInfo;
  get isCached(): boolean;
  isLoaded(): Promise<boolean>;

  get contextLength(): number | null;
  get inputModalities(): string | null;
  get outputModalities(): string | null;
  get capabilities(): string | null;
  get supportsToolCalling(): boolean | null;

  download(progressCallback?: (progress: number) => void): Promise<void>;
  get path(): string;
  load(): Promise<void>;
  removeFromCache(): void;
  unload(): Promise<void>;

  createChatClient(): ChatClient;
  createAudioClient(): AudioClient;
  createEmbeddingClient(): EmbeddingClient;
  createResponsesClient(baseUrl: string): ResponsesClient;

  get variants(): IModel[];
  selectVariant(variant: IModel): void;
}
```

Lifecycle methods:

- `download(progressCallback?)`: downloads the selected model variant. Progress is a number and, where documented, is `0-100`.
- `path`: local file path for the selected variant.
- `load()`: loads the model into memory.
- `removeFromCache()`: removes the selected variant from the local cache.
- `unload()`: unloads the model from memory.

Client factories:

- `createChatClient()` creates an FFI-backed chat client.
- `createAudioClient()` creates an FFI-backed audio client.
- `createEmbeddingClient()` creates an FFI-backed embeddings client.
- `createResponsesClient(baseUrl)` creates an HTTP-backed Responses client using the Foundry Local web service.

Variant handling:

- `variants` exposes all available variants for a model.
- `selectVariant(variant)` changes which variant subsequent `IModel` operations act on.
- The declarations state that the provided variant must come from `variants`; otherwise an error is thrown.

### `ModelLoadManager`

Publicly exported load/unload manager for model lifecycle operations.

```ts
class ModelLoadManager {
  constructor(coreInterop: CoreInterop, externalServiceUrl?: string);
  load(modelId: string): Promise<void>;
  unload(modelId: string): Promise<void>;
  listLoaded(): Promise<string[]>;
}
```

Declared behavior:

- `load(modelId)` loads a model into memory.
- `unload(modelId)` unloads a model from memory.
- `listLoaded()` returns the IDs of all loaded models.

The declarations mention future or alternate support for delegating these operations through an external service.

## Chat API

### `ChatClientSettings`

Mutable settings bag used by `ChatClient`.

```ts
class ChatClientSettings {
  frequencyPenalty?: number;
  maxTokens?: number;
  n?: number;
  temperature?: number;
  presencePenalty?: number;
  randomSeed?: number;
  topK?: number;
  topP?: number;
  responseFormat?: ResponseFormat;
  toolChoice?: ToolChoice;
}
```

The declaration says settings are serialized into an OpenAI-compatible request object.

### `ChatClient`

FFI-backed client for chat completions, structured like the OpenAI Chat Completions API.

```ts
class ChatClient {
  settings: ChatClientSettings;

  completeChat(messages: any[]): Promise<any>;
  completeChat(messages: any[], tools: any[]): Promise<any>;

  completeStreamingChat(messages: any[]): AsyncIterable<any>;
  completeStreamingChat(messages: any[], tools: any[]): AsyncIterable<any>;
}
```

Observed contract from the declarations:

- `messages` is expected to be an array of message objects like `{ role: 'user', content: 'Hello' }`.
- `tools` is expected to be an array of tool objects.
- `completeChat()` performs a non-streaming completion.
- `completeStreamingChat()` returns an `AsyncIterable` of parsed streaming chunks.
- Validation methods exist internally for both `messages` and `tools`, so malformed inputs should be expected to throw.

The response and chunk types are declared as `any`, so the package does not currently provide strong TypeScript types for chat completion payloads.

## Audio API

### `AudioClientSettings`

```ts
class AudioClientSettings {
  language?: string;
  temperature?: number;
}
```

The declaration says settings serialize to an OpenAI-compatible request object.

### `AudioClient`

FFI-backed client for audio transcription operations.

```ts
class AudioClient {
  settings: AudioClientSettings;

  createLiveTranscriptionSession(): LiveAudioTranscriptionSession;
  transcribe(audioFilePath: string): Promise<any>;
  transcribeStreaming(audioFilePath: string): AsyncIterable<any>;
}
```

Declared behavior:

- `createLiveTranscriptionSession()` creates a real-time streaming ASR session.
- `transcribe(audioFilePath)` performs file-based transcription.
- `transcribeStreaming(audioFilePath)` returns an `AsyncIterable` of transcription chunks.
- `audioFilePath` must be a non-empty string.

As with `ChatClient`, the actual transcription response types here are `any` in the declarations.

## Live Audio Streaming API

### `LiveAudioTranscriptionOptions`

Settings object used by `LiveAudioTranscriptionSession.settings`.

```ts
class LiveAudioTranscriptionOptions {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  language?: string;
  pushQueueCapacity: number;
  snapshot(): LiveAudioTranscriptionOptions;
}
```

Defaults documented in the declarations:

- `sampleRate`: `16000`
- `channels`: `1`
- `bitsPerSample`: `16`
- `pushQueueCapacity`: `100`
- `language`: optional BCP-47 hint such as `en` or `zh`

Important session rule:

- These settings must be configured before `start()`.
- Settings are frozen for the active session once `start()` is called.

### `LiveAudioTranscriptionSession`

Streaming ASR session that accepts pushed PCM bytes and emits transcription results.

```ts
class LiveAudioTranscriptionSession {
  settings: LiveAudioTranscriptionOptions;

  start(): Promise<void>;
  append(pcmData: Uint8Array): Promise<void>;
  getStream(): AsyncGenerator<LiveAudioTranscriptionResponse>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}
```

Declared usage model:

- `start()` must be called before `append()` or `getStream()`.
- `append(pcmData)` pushes raw PCM bytes matching the configured audio format.
- `getStream()` yields `LiveAudioTranscriptionResponse` items as transcription proceeds.
- `stop()` signals end-of-audio, drains any queued audio, and allows final results to flush before completion.
- `dispose()` tears down the session and is safe to call multiple times.

Additional notes from the declarations:

- Audio chunks are internally queued and serialized to native core one at a time.
- The internal push loop terminates the session on native error.
- `getStream()` is modeled as a single async generator.

### `LiveAudioTranscriptionResponse`

```ts
interface LiveAudioTranscriptionResponse {
  id?: string | null;
  is_final: boolean;
  content: TranscriptionContentPart[];
  start_time?: number | null;
  end_time?: number | null;
}
```

### `TranscriptionContentPart`

```ts
interface TranscriptionContentPart {
  text?: string | null;
  transcript?: string | null;
}
```

Semantics called out in the declarations:

- Results are shaped similarly to OpenAI Realtime API conversation items.
- Access text through `result.content[0].text` or `result.content[0].transcript`.
- `is_final` distinguishes interim from final segments.
- `start_time` and `end_time` are second offsets in the audio stream.

### `CoreErrorResponse`

Also declared in `liveAudioTypes.d.ts`:

```ts
interface CoreErrorResponse {
  code: string;
  message: string;
  isTransient: boolean;
}
```

This is marked as a structured error response from native core audio streaming commands.

## Embeddings API

### `EmbeddingClient`

FFI-backed client for text embeddings.

```ts
class EmbeddingClient {
  generateEmbedding(input: string): Promise<any>;
  generateEmbeddings(inputs: string[]): Promise<any>;
}
```

Declared behavior:

- `generateEmbedding(input)` generates one embedding for a single non-empty input string.
- `generateEmbeddings(inputs)` generates embeddings for multiple non-empty strings in one request.
- Internal validation exists for both the single-input and multi-input forms.

The package does not provide strong TypeScript response types for embedding results; return types are declared as `any`.

## Responses API

The Responses API is the most strongly typed part of the package. It is explicitly HTTP-based rather than FFI-based.

### `ResponsesClientSettings`

```ts
class ResponsesClientSettings {
  instructions?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  toolChoice?: ResponseToolChoice;
  truncation?: TruncationStrategy;
  parallelToolCalls?: boolean;
  store?: boolean;
  metadata?: Record<string, string>;
  reasoning?: ReasoningConfig;
  text?: TextConfig;
  seed?: number;
}
```

The declarations note that properties use camelCase in JavaScript and are serialized to snake_case for the API.

### `ResponsesClient`

```ts
class ResponsesClient {
  settings: ResponsesClientSettings;

  constructor(baseUrl: string, modelId?: string);

  create(input: string | ResponseInputItem[], options?: Partial<ResponseCreateParams>): Promise<ResponseObject>;
  createStreaming(
    input: string | ResponseInputItem[],
    callback: (event: StreamingEvent) => void,
    options?: Partial<ResponseCreateParams>
  ): Promise<void>;
  get(responseId: string): Promise<ResponseObject>;
  delete(responseId: string): Promise<DeleteResponseResult>;
  cancel(responseId: string): Promise<ResponseObject>;
  getInputItems(responseId: string): Promise<InputItemsListResponse>;
}
```

Key behavior from the declarations:

- `baseUrl` should be the Foundry Local web service base URL such as `http://127.0.0.1:5273`.
- `modelId` is optional at client construction time and can be overridden per request.
- `create()` returns a completed `ResponseObject`.
- The declaration explicitly warns that callers should inspect `response.status` and `response.error` even when the HTTP request succeeds, because the server can return HTTP 200 for model-level failures.
- `createStreaming()` uses Server-Sent Events and invokes the callback for each `StreamingEvent`.
- `get()`, `delete()`, `cancel()`, and `getInputItems()` operate on stored response IDs.

### `getOutputText(response)`

```ts
function getOutputText(response: ResponseObject): string;
```

Utility that extracts concatenated text from the first assistant message in a `ResponseObject`, matching the behavior documented as analogous to the OpenAI Python SDK's `response.output_text`.

## Responses API Types

### Request types

#### `ResponseCreateParams`

```ts
interface ResponseCreateParams {
  model?: string;
  input?: string | ResponseInputItem[];
  instructions?: string;
  previous_response_id?: string;
  tools?: FunctionToolDefinition[];
  tool_choice?: ResponseToolChoice;
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  truncation?: TruncationStrategy;
  parallel_tool_calls?: boolean;
  store?: boolean;
  metadata?: Record<string, string>;
  stream?: boolean;
  reasoning?: ReasoningConfig;
  text?: TextConfig;
  seed?: number;
  user?: string;
}
```

#### `FunctionToolDefinition`

```ts
interface FunctionToolDefinition {
  type: 'function';
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
}
```

#### `ResponseToolChoice`

```ts
type ResponseToolChoice = 'none' | 'auto' | 'required' | ResponseToolChoiceFunction;

interface ResponseToolChoiceFunction {
  type: 'function';
  name: string;
}
```

#### `ReasoningConfig`

```ts
interface ReasoningConfig {
  effort?: string;
  summary?: string;
}
```

#### `TextConfig` and `TextFormat`

```ts
interface TextConfig {
  format?: TextFormat;
  verbosity?: string;
}

interface TextFormat {
  type: string;
  name?: string;
  description?: string;
  schema?: unknown;
  strict?: boolean;
}
```

#### Other request enums and aliases

```ts
type TruncationStrategy = 'auto' | 'disabled';
type ServiceTier = 'default' | 'auto' | 'flex' | 'priority';
type MessageRole = 'system' | 'user' | 'assistant' | 'developer';
type ResponseItemStatus = 'in_progress' | 'completed' | 'incomplete';
type ResponseStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'incomplete' | 'cancelled';
```

Note: `ServiceTier` is declared in `types.d.ts` but is not referenced by `ResponsesClient` declarations.

### Input and output item types

#### Content parts

```ts
interface InputTextContent {
  type: 'input_text';
  text: string;
}

interface OutputTextContent {
  type: 'output_text';
  text: string;
  annotations?: Annotation[];
  logprobs?: LogProb[];
}

interface RefusalContent {
  type: 'refusal';
  refusal: string;
}

type ContentPart = InputTextContent | OutputTextContent | RefusalContent;
```

#### Message and function call items

```ts
interface MessageItem {
  type: 'message';
  id?: string;
  role: MessageRole;
  content: string | ContentPart[];
  status?: ResponseItemStatus;
}

interface FunctionCallItem {
  type: 'function_call';
  id?: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: ResponseItemStatus;
}

interface FunctionCallOutputItem {
  type: 'function_call_output';
  id?: string;
  call_id: string;
  output: string | ContentPart[];
  status?: ResponseItemStatus;
}

interface ItemReference {
  type: 'item_reference';
  id: string;
}

interface ReasoningItem {
  type: 'reasoning';
  id?: string;
  content?: ContentPart[];
  encrypted_content?: string;
  summary?: string;
  status?: ResponseItemStatus;
}

type ResponseInputItem =
  | MessageItem
  | FunctionCallItem
  | FunctionCallOutputItem
  | ItemReference
  | ReasoningItem;

type ResponseOutputItem = MessageItem | FunctionCallItem | ReasoningItem;
```

### Response object types

#### `ResponseObject`

```ts
interface ResponseObject {
  id: string;
  object: 'response';
  created_at: number;
  completed_at?: number | null;
  failed_at?: number | null;
  cancelled_at?: number | null;
  status: ResponseStatus;
  incomplete_details?: IncompleteDetails | null;
  model: string;
  previous_response_id?: string | null;
  instructions?: string | null;
  output: ResponseOutputItem[];
  error?: ResponseError | null;
  tools: FunctionToolDefinition[];
  tool_choice: ResponseToolChoice;
  truncation: TruncationStrategy;
  parallel_tool_calls: boolean;
  text: TextConfig;
  top_p: number;
  temperature: number;
  presence_penalty: number;
  frequency_penalty: number;
  max_output_tokens?: number | null;
  reasoning?: ReasoningConfig | null;
  store: boolean;
  metadata?: Record<string, string> | null;
  usage?: ResponseUsage | null;
  user?: string | null;
}
```

#### Supporting response types

```ts
interface ResponseUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: { cached_tokens: number };
  output_tokens_details?: { reasoning_tokens: number };
}

interface ResponseError {
  code: string;
  message: string;
}

interface IncompleteDetails {
  reason: string;
}

interface InputItemsListResponse {
  object: 'list';
  data: ResponseInputItem[];
}

interface DeleteResponseResult {
  id: string;
  object: string;
  deleted: boolean;
}
```

### Annotation and token detail types

```ts
interface Annotation {
  type: string;
  start_index: number;
  end_index: number;
}

interface UrlCitationAnnotation extends Annotation {
  type: 'url_citation';
  url: string;
  title: string;
}

interface LogProb {
  token: string;
  logprob: number;
  bytes?: number[];
}
```

### Streaming event types

The Responses API streaming callback receives `StreamingEvent`, a union of these event shapes:

```ts
interface ResponseLifecycleEvent {
  type:
    | 'response.created'
    | 'response.queued'
    | 'response.in_progress'
    | 'response.completed'
    | 'response.failed'
    | 'response.incomplete';
  response: ResponseObject;
  sequence_number: number;
}

interface OutputItemAddedEvent {
  type: 'response.output_item.added';
  item_id: string;
  output_index: number;
  item: ResponseOutputItem;
  sequence_number: number;
}

interface OutputItemDoneEvent {
  type: 'response.output_item.done';
  item_id: string;
  output_index: number;
  item: ResponseOutputItem;
  sequence_number: number;
}

interface ContentPartAddedEvent {
  type: 'response.content_part.added';
  item_id: string;
  content_index: number;
  part: ContentPart;
  sequence_number: number;
}

interface ContentPartDoneEvent {
  type: 'response.content_part.done';
  item_id: string;
  content_index: number;
  part: ContentPart;
  sequence_number: number;
}

interface OutputTextDeltaEvent {
  type: 'response.output_text.delta';
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
  sequence_number: number;
}

interface OutputTextDoneEvent {
  type: 'response.output_text.done';
  item_id: string;
  output_index: number;
  content_index: number;
  text: string;
  sequence_number: number;
}

interface RefusalDeltaEvent {
  type: 'response.refusal.delta';
  item_id: string;
  content_index: number;
  delta: string;
  sequence_number: number;
}

interface RefusalDoneEvent {
  type: 'response.refusal.done';
  item_id: string;
  content_index: number;
  refusal: string;
  sequence_number: number;
}

interface FunctionCallArgsDeltaEvent {
  type: 'response.function_call_arguments.delta';
  item_id: string;
  output_index: number;
  delta: string;
  sequence_number: number;
}

interface FunctionCallArgsDoneEvent {
  type: 'response.function_call_arguments.done';
  item_id: string;
  output_index: number;
  arguments: string;
  name: string;
  sequence_number: number;
}

interface StreamingErrorEvent {
  type: 'error';
  code?: string;
  message?: string;
  param?: string;
  sequence_number: number;
}

type StreamingEvent =
  | ResponseLifecycleEvent
  | OutputItemAddedEvent
  | OutputItemDoneEvent
  | ContentPartAddedEvent
  | ContentPartDoneEvent
  | OutputTextDeltaEvent
  | OutputTextDoneEvent
  | RefusalDeltaEvent
  | RefusalDoneEvent
  | FunctionCallArgsDeltaEvent
  | FunctionCallArgsDoneEvent
  | StreamingErrorEvent;
```

## Shared Model Metadata Types

### `ModelInfo`

`IModel.info` returns this structure:

```ts
interface ModelInfo {
  id: string;
  name: string;
  version: number;
  alias: string;
  displayName?: string | null;
  providerType: string;
  uri: string;
  modelType: string;
  promptTemplate?: PromptTemplate | null;
  publisher?: string | null;
  modelSettings?: ModelSettings | null;
  license?: string | null;
  licenseDescription?: string | null;
  cached: boolean;
  task?: string | null;
  runtime?: Runtime | null;
  fileSizeMb?: number | null;
  supportsToolCalling?: boolean | null;
  maxOutputTokens?: number | null;
  minFLVersion?: string | null;
  createdAtUnix: number;
  contextLength?: number | null;
  inputModalities?: string | null;
  outputModalities?: string | null;
  capabilities?: string | null;
}
```

### Supporting metadata types

```ts
interface PromptTemplate {
  system?: string | null;
  user?: string | null;
  assistant: string;
  prompt: string;
}

interface Runtime {
  deviceType: DeviceType;
  executionProvider: string;
}

enum DeviceType {
  Invalid = 'Invalid',
  CPU = 'CPU',
  GPU = 'GPU',
  NPU = 'NPU'
}

interface Parameter {
  name: string;
  value?: string | null;
}

interface ModelSettings {
  parameters?: Parameter[] | null;
}
```

## Execution Provider Types

### `EpInfo`

```ts
interface EpInfo {
  name: string;
  isRegistered: boolean;
}
```

Represents a discoverable execution provider bootstrapper.

### `EpDownloadResult`

```ts
interface EpDownloadResult {
  success: boolean;
  status: string;
  registeredEps: string[];
  failedEps: string[];
}
```

Represents the outcome of an EP download and registration operation.

## Practical API Shape Summary

The declarations imply three main integration styles:

1. Manager-first setup

```ts
import { FoundryLocalManager } from 'foundry-local-sdk';

const manager = await FoundryLocalManager.createAsync({
  appName: 'foundry-local-app'
});
```

2. Catalog-driven model lifecycle

```ts
const model = await manager.catalog.getModel('some-alias');
await model.download();
await model.load();
```

3. Two transport styles for inference

```ts
const chat = model.createChatClient();      // FFI-backed
const audio = model.createAudioClient();    // FFI-backed
const embed = model.createEmbeddingClient(); // FFI-backed

manager.startWebService();
const responses = manager.createResponsesClient(model.id); // HTTP-backed
```

## Gaps and Caveats in the Type Surface

These limitations come directly from the declarations:

- `ChatClient`, `AudioClient`, and `EmbeddingClient` return `Promise<any>` or `AsyncIterable<any>` rather than strongly typed API payloads.
- The package publicly exports `ModelLoadManager`, but its constructor depends on `CoreInterop`, which is marked internal.
- `Model` exposes `createLiveTranscriptionSession()` in its declaration, but `IModel` does not include that method. Code typed as `IModel` cannot rely on it without narrowing or casting.
- `ServiceTier` is declared but not currently wired into `ResponseCreateParams` or `ResponsesClientSettings`.
- Some public classes expose constructors that depend on internal types, indicating the intended usage path is through factory methods such as `FoundryLocalManager.create*()` and `IModel.create*Client()`.

## Source Files Reviewed

This document was derived from these declaration files only:

- `dist/index.d.ts`
- `dist/foundryLocalManager.d.ts`
- `dist/catalog.d.ts`
- `dist/configuration.d.ts`
- `dist/imodel.d.ts`
- `dist/types.d.ts`
- `dist/openai/chatClient.d.ts`
- `dist/openai/audioClient.d.ts`
- `dist/openai/embeddingClient.d.ts`
- `dist/openai/responsesClient.d.ts`
- `dist/openai/liveAudioSession.d.ts`
- `dist/openai/liveAudioTypes.d.ts`
- `dist/detail/modelLoadManager.d.ts`
- `dist/detail/model.d.ts`
- `dist/detail/modelVariant.d.ts`
