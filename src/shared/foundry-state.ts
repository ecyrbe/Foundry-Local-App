import type { FoundryLocalConfig } from 'foundry-local-sdk';

export const FOUNDRY_LOCAL_APP_NAME = 'foundry';

export const foundryLocalBootstrapConfig: FoundryLocalConfig = {
  appName: FOUNDRY_LOCAL_APP_NAME,
  
  logLevel: 'info' as const
};

export type BootstrapStage = 'starting' | 'ready' | 'failed';
export type SdkStage = 'initializing' | 'ready' | 'failed';
export type WebServiceStage = 'running' | 'stopped';

export interface FoundryErrorView {
  message: string;
  code?: string;
}

export interface FoundryAppState {
  bootstrapStage: BootstrapStage;
  sdkStage: SdkStage;
  webServiceStage: WebServiceStage;
  loadedModelCount: number;
  startupConfigSummary: string;
  webServiceUrls: string[];
  lastError: FoundryErrorView | null;
}

export interface FoundryCatalogModelView {
  id: string;
  alias: string;
  name: string;
  version: string;
  modelType: string;
  task: string;
  size: string;
  contextLength: string;
  inputModalities: string[];
  outputModalities: string[];
  downloaded: boolean;
  loaded: boolean;
  supportsTextChat: boolean;
  supportsLiveTranscription: boolean;
  supportsToolCalling: boolean;
}

export interface FoundryCatalogView {
  models: FoundryCatalogModelView[];
}

export type FoundryCatalogAction = 'download' | 'remove' | 'load' | 'unload';

export interface FoundryDownloadProgressEvent {
  modelId: string;
  progress: number;
}

export interface FoundryExecutionProviderView {
  name: string;
  isRegistered: boolean;
}

export interface FoundryRuntimeView {
  webServiceRunning: boolean;
  webServiceUrls: string[];
  executionProviders: FoundryExecutionProviderView[];
}

export interface FoundryAudioInputDeviceView {
  id: number;
  name: string;
  hostApiName: string;
  maxInputChannels: number;
  defaultSampleRate: number;
}

export interface FoundryAudioSettingsInput {
  selectedInputDeviceId: number | null;
  sampleRate: number;
  channels: number;
  bitsPerSample: 16 | 32;
  language: string;
}

export interface FoundryAudioSettingsView extends FoundryAudioSettingsInput {
  availableInputDevices: FoundryAudioInputDeviceView[];
  deviceAccessError: string | null;
}

export interface FoundryEpDownloadProgressEvent {
  epName: string;
  progress: number;
}

export interface FoundryEpDownloadResultView {
  success: boolean;
  status: string;
  registeredEps: string[];
  failedEps: string[];
}

export type FoundryChatMessageRole = 'user' | 'assistant';

export interface FoundryChatMessageView {
  id: string;
  role: FoundryChatMessageRole;
  content: string;
  createdAt: string;
  failed?: boolean;
}

export interface FoundryChatSessionView {
  id: string;
  title: string;
  modelId: string;
  modelName: string;
  modelAlias: string;
  lastResponseId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  modelLoaded: boolean;
}

export interface FoundryChatSessionDetailView {
  session: FoundryChatSessionView;
  messages: FoundryChatMessageView[];
}

export interface FoundryChatView {
  sessions: FoundryChatSessionView[];
  activeSessionId: string | null;
}

export interface FoundryChatSendResultView {
  session: FoundryChatSessionDetailView;
}

export type FoundryChatStreamEvent =
  | {
    type: 'assistant-message-started';
    sessionId: string;
    message: FoundryChatMessageView;
  }
  | {
    type: 'assistant-message-delta';
    sessionId: string;
    messageId: string;
    delta: string;
  }
  | {
    type: 'assistant-message-completed';
    sessionId: string;
    messageId: string;
    responseId: string | null;
  }
  | {
    type: 'assistant-message-failed';
    sessionId: string;
    message: FoundryChatMessageView;
  };

export interface FoundryTranscriptEntryView {
  id: string;
  content: string;
  createdAt: string;
  startTime: number | null;
  endTime: number | null;
  failed?: boolean;
}

export interface FoundryTranscriptSessionView {
  id: string;
  title: string;
  modelId: string;
  modelName: string;
  modelAlias: string;
  createdAt: string;
  updatedAt: string;
  entryCount: number;
  modelLoaded: boolean;
  isTranscribing: boolean;
}

export interface FoundryTranscriptSessionDetailView {
  session: FoundryTranscriptSessionView;
  entries: FoundryTranscriptEntryView[];
}

export interface FoundryTranscriptView {
  sessions: FoundryTranscriptSessionView[];
  activeSessionId: string | null;
}

export type FoundryTranscriptStreamEvent =
  | {
    type: 'transcription-started';
    sessionId: string;
  }
  | {
    type: 'transcription-preview-updated';
    sessionId: string;
    preview: string;
  }
  | {
    type: 'transcription-entry-committed';
    sessionId: string;
    entry: FoundryTranscriptEntryView;
  }
  | {
    type: 'transcription-stopped';
    sessionId: string;
  }
  | {
    type: 'transcription-failed';
    sessionId: string;
    message: string;
  };

export interface FoundryAppApi {
  getAppState: () => Promise<FoundryAppState>;
  getCatalog: () => Promise<FoundryCatalogView>;
  refreshCatalog: () => Promise<FoundryCatalogView>;
  mutateCatalogModel: (modelId: string, action: FoundryCatalogAction) => Promise<FoundryCatalogView>;
  getRuntime: () => Promise<FoundryRuntimeView>;
  startWebService: () => Promise<FoundryRuntimeView>;
  stopWebService: () => Promise<FoundryRuntimeView>;
  registerExecutionProviders: (epNames?: string[]) => Promise<FoundryEpDownloadResultView>;
  getAudioSettings: () => Promise<FoundryAudioSettingsView>;
  updateAudioSettings: (settings: FoundryAudioSettingsInput) => Promise<FoundryAudioSettingsView>;
  getChatSessions: () => Promise<FoundryChatView>;
  getChatSession: (sessionId: string) => Promise<FoundryChatSessionDetailView>;
  createChatSession: (modelId: string) => Promise<FoundryChatSessionDetailView>;
  updateChatSessionModel: (sessionId: string, modelId: string) => Promise<FoundryChatSessionDetailView>;
  deleteChatSession: (sessionId: string) => Promise<FoundryChatView>;
  loadChatSessionModel: (sessionId: string) => Promise<FoundryChatView>;
  unloadChatSessionModel: (sessionId: string) => Promise<FoundryChatView>;
  sendChatMessage: (sessionId: string, message: string) => Promise<FoundryChatSendResultView>;
  getTranscriptSessions: () => Promise<FoundryTranscriptView>;
  getTranscriptSession: (sessionId: string) => Promise<FoundryTranscriptSessionDetailView>;
  createTranscriptSession: (modelId: string) => Promise<FoundryTranscriptSessionDetailView>;
  updateTranscriptSessionModel: (sessionId: string, modelId: string) => Promise<FoundryTranscriptSessionDetailView>;
  deleteTranscriptSession: (sessionId: string) => Promise<FoundryTranscriptView>;
  loadTranscriptSessionModel: (sessionId: string) => Promise<FoundryTranscriptView>;
  unloadTranscriptSessionModel: (sessionId: string) => Promise<FoundryTranscriptView>;
  startTranscriptSession: (sessionId: string) => Promise<FoundryTranscriptSessionDetailView>;
  stopTranscriptSession: (sessionId: string) => Promise<FoundryTranscriptSessionDetailView>;
  onCatalogDownloadProgress: (listener: (event: FoundryDownloadProgressEvent) => void) => () => void;
  onEpDownloadProgress: (listener: (event: FoundryEpDownloadProgressEvent) => void) => () => void;
  onChatStreamEvent: (listener: (event: FoundryChatStreamEvent) => void) => () => void;
  onTranscriptStreamEvent: (listener: (event: FoundryTranscriptStreamEvent) => void) => () => void;
}

declare global {
  interface Window {
    foundryLocalApp: FoundryAppApi;
  }
}

export {};
