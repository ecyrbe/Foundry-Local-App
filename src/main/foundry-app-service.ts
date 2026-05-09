import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DeviceInfo, IoStreamRead } from 'naudiodon2';
import { FoundryLocalManager, getOutputText, type EpDownloadResult, type EpInfo, type FoundryLocalConfig, type IModel, type ResponseInputItem } from 'foundry-local-sdk';
import {
  type FoundryAudioInputDeviceView,
  type FoundryAudioSettingsInput,
  type FoundryAudioSettingsView,
  foundryLocalBootstrapConfig,
  type FoundryCatalogAction,
  type FoundryCatalogModelView,
  type FoundryCatalogView,
  type FoundryAppState,
  type FoundryChatStreamEvent,
  type FoundryChatMessageView,
  type FoundryChatSendResultView,
  type FoundryChatSessionDetailView,
  type FoundryChatSessionView,
  type FoundryChatView,
  type FoundryEpDownloadProgressEvent,
  type FoundryEpDownloadResultView,
  type FoundryDownloadProgressEvent,
  type FoundryTranscriptEntryView,
  type FoundryTranscriptSessionDetailView,
  type FoundryTranscriptSessionView,
  type FoundryTranscriptStreamEvent,
  type FoundryTranscriptView,
  type FoundryRuntimeView,
  type FoundryErrorView
} from '../shared/foundry-state.js';

const epPreferencesFileName = 'execution-provider-preferences.json';
const chatSessionsFileName = 'chat-sessions.json';
const transcriptSessionsFileName = 'transcript-sessions.json';
const audioSettingsFileName = 'audio-settings.json';

interface FoundryEpPreferences {
  preferredExecutionProviders: string[];
}

interface StoredChatSession {
  id: string;
  title: string;
  modelId: string;
  modelName: string;
  modelAlias: string;
  lastResponseId: string | null;
  needsContextHydration: boolean;
  createdAt: string;
  updatedAt: string;
  messages: FoundryChatMessageView[];
}

interface StoredChatSessionsState {
  activeSessionId: string | null;
  sessions: StoredChatSession[];
}

interface StoredTranscriptEntry {
  id: string;
  content: string;
  createdAt: string;
  startTime: number | null;
  endTime: number | null;
  failed?: boolean;
}

interface StoredTranscriptSession {
  id: string;
  title: string;
  modelId: string;
  modelName: string;
  modelAlias: string;
  createdAt: string;
  updatedAt: string;
  entries: StoredTranscriptEntry[];
}

interface StoredTranscriptSessionsState {
  activeSessionId: string | null;
  sessions: StoredTranscriptSession[];
}

interface StoredAudioSettings extends FoundryAudioSettingsInput {}

interface LiveTranscriptionResult {
  is_final: boolean;
  content?: Array<{
    text?: string | null;
    transcript?: string | null;
  }>;
  start_time?: number | null;
  end_time?: number | null;
}

interface LiveTranscriptionSessionLike {
  settings: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    language?: string;
  };
  start(): Promise<void>;
  append(pcmData: Uint8Array): Promise<void>;
  getStream(): AsyncGenerator<LiveTranscriptionResult>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

interface AudioClientLike {
  settings?: {
    language?: string;
  };
  createLiveTranscriptionSession(): LiveTranscriptionSessionLike;
}

interface NaudiodonModuleLike {
  getDevices(): DeviceInfo[];
  AudioIO(options: { inOptions: {
    deviceId?: number;
    channelCount?: number;
    sampleFormat?: 16 | 32;
    sampleRate?: number;
    framesPerBuffer?: number;
    maxQueue?: number;
    closeOnError?: boolean;
  } }): IoStreamRead;
  SampleFormat16Bit: 16;
  SampleFormat32Bit: 32;
}

interface ActiveTranscriptRuntime {
  sessionId: string;
  modelId: string;
  session: LiveTranscriptionSessionLike;
  audioInput: IoStreamRead;
  previewText: string;
  appendQueue: Uint8Array[];
  pumpError: unknown;
  pumping: boolean;
  stopRequested: boolean;
  lifecyclePromise: Promise<void> | null;
  stopPromise: Promise<void> | null;
}

const defaultAudioSettings: StoredAudioSettings = {
  selectedInputDeviceId: null,
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  language: 'en'
};

function toErrorView(error: unknown): FoundryErrorView {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: error.name
    };
  }

  return {
    message: 'Unknown SDK bootstrap error'
  };
}

export class FoundryAppService {
  private manager: FoundryLocalManager | null = null;

  private startupConfig: FoundryLocalConfig | null = null;

  private epPreferences: FoundryEpPreferences | null = null;

  private chatSessionsState: StoredChatSessionsState | null = null;

  private transcriptSessionsState: StoredTranscriptSessionsState | null = null;

  private audioSettings: StoredAudioSettings | null = null;

  private activeTranscriptRuntime: ActiveTranscriptRuntime | null = null;

  private readonly downloadProgressListeners = new Set<(event: FoundryDownloadProgressEvent) => void>();

  private readonly epDownloadProgressListeners = new Set<(event: FoundryEpDownloadProgressEvent) => void>();

  private readonly chatStreamListeners = new Set<(event: FoundryChatStreamEvent) => void>();

  private readonly transcriptStreamListeners = new Set<(event: FoundryTranscriptStreamEvent) => void>();

  private state: FoundryAppState = {
    bootstrapStage: 'starting',
    sdkStage: 'initializing',
    webServiceStage: 'stopped',
    loadedModelCount: 0,
    startupConfigSummary: 'Waiting for Electron app readiness...',
    webServiceUrls: [],
    lastError: null
  };

  private initializationPromise: Promise<void> | null = null;

  initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.initializeInternal();
    return this.initializationPromise;
  }

  async getAppState(): Promise<FoundryAppState> {
    await this.initialize();

    if (!this.manager) {
      return this.snapshot();
    }

    try {
      const loadedModels = await this.manager.catalog.getLoadedModels();

      this.state = {
        ...this.state,
        loadedModelCount: loadedModels.length,
        webServiceStage: this.manager.isWebServiceRunning ? 'running' : 'stopped',
        webServiceUrls: this.manager.urls
      };
    } catch (error) {
      this.recordFailure(error, false);
    }

    return this.snapshot();
  }

  async getCatalog(): Promise<FoundryCatalogView> {
    await this.initialize();

    if (!this.manager) {
      return { models: [] };
    }

    return {
      models: await this.readCatalogModels(this.manager.catalog.getModels())
    };
  }

  async refreshCatalog(): Promise<FoundryCatalogView> {
    await this.initialize();

    if (!this.manager) {
      return { models: [] };
    }

    this.manager.catalog.invalidateCache();

    return {
      models: await this.readCatalogModels(this.manager.catalog.getModels())
    };
  }

  async getRuntime(): Promise<FoundryRuntimeView> {
    await this.initialize();

    if (!this.manager) {
      return {
        webServiceRunning: false,
        webServiceUrls: [],
        executionProviders: []
      };
    }

    return this.readRuntimeView();
  }

  async startWebService(): Promise<FoundryRuntimeView> {
    await this.initialize();

    if (!this.manager) {
      return {
        webServiceRunning: false,
        webServiceUrls: [],
        executionProviders: []
      };
    }

    this.manager.startWebService();
    await this.getAppState();

    return this.readRuntimeView();
  }

  async stopWebService(): Promise<FoundryRuntimeView> {
    await this.initialize();

    if (!this.manager) {
      return {
        webServiceRunning: false,
        webServiceUrls: [],
        executionProviders: []
      };
    }

    this.manager.stopWebService();
    await this.getAppState();

    return this.readRuntimeView();
  }

  async registerExecutionProviders(epNames?: string[]): Promise<FoundryEpDownloadResultView> {
    await this.initialize();

    if (!this.manager) {
      return {
        success: false,
        status: 'Foundry Local manager is unavailable.',
        registeredEps: [],
        failedEps: []
      };
    }

    const result = epNames && epNames.length > 0
      ? await this.manager.downloadAndRegisterEps(epNames, (epName, progress) => {
        this.emitEpDownloadProgress({ epName, progress });
      })
      : await this.manager.downloadAndRegisterEps((epName, progress) => {
        this.emitEpDownloadProgress({ epName, progress });
      });

    await this.persistRegisteredExecutionProviders();

    return toEpDownloadResultView(result);
  }

  async getAudioSettings(): Promise<FoundryAudioSettingsView> {
    await this.initialize();

    const settings = await this.readAudioSettings();
    const availableInputDevices = await this.readAudioInputDevices();
    const selectedDeviceStillExists = settings.selectedInputDeviceId === null
      || availableInputDevices.some((device) => device.id === settings.selectedInputDeviceId);

    return {
      ...settings,
      selectedInputDeviceId: selectedDeviceStillExists ? settings.selectedInputDeviceId : null,
      availableInputDevices,
      deviceAccessError: null
    };
  }

  async updateAudioSettings(settings: FoundryAudioSettingsInput): Promise<FoundryAudioSettingsView> {
    await this.initialize();

    const nextSettings = normalizeAudioSettings(settings);
    const availableInputDevices = await this.readAudioInputDevices();

    if (nextSettings.selectedInputDeviceId !== null && !availableInputDevices.some((device) => device.id === nextSettings.selectedInputDeviceId)) {
      throw new Error('Selected audio input device is not available.');
    }

    this.audioSettings = nextSettings;
    await this.persistAudioSettings();

    return {
      ...nextSettings,
      availableInputDevices,
      deviceAccessError: null
    };
  }

  async getChatSessions(): Promise<FoundryChatView> {
    await this.initialize();

    const chatSessionsState = await this.readChatSessionsState();

    return {
      sessions: await this.toChatSessionViews(chatSessionsState.sessions),
      activeSessionId: chatSessionsState.activeSessionId
    };
  }

  async getTranscriptSessions(): Promise<FoundryTranscriptView> {
    await this.initialize();

    const transcriptSessionsState = await this.readTranscriptSessionsState();

    return {
      sessions: await this.toTranscriptSessionViews(transcriptSessionsState.sessions),
      activeSessionId: transcriptSessionsState.activeSessionId
    };
  }

  async getTranscriptSession(sessionId: string): Promise<FoundryTranscriptSessionDetailView> {
    await this.initialize();

    const transcriptSession = await this.requireTranscriptSession(sessionId);

    return toTranscriptSessionDetailView(transcriptSession, this.activeTranscriptRuntime?.sessionId === transcriptSession.id);
  }

  async getChatSession(sessionId: string): Promise<FoundryChatSessionDetailView> {
    await this.initialize();

    const chatSession = await this.requireChatSession(sessionId);

    return toChatSessionDetailView(chatSession);
  }

  async createChatSession(modelId: string): Promise<FoundryChatSessionDetailView> {
    await this.initialize();

    if (!this.manager) {
      throw new Error('Foundry Local manager is unavailable.');
    }

    const model = await this.manager.catalog.getModelVariant(modelId);

    if (!model.isCached) {
      throw new Error('Only downloaded models can be used for chat sessions.');
    }

    if (!supportsTextChat(model)) {
      throw new Error('Only text chat models can be used for chat sessions.');
    }

    const chatSessionsState = await this.readChatSessionsState();

    const now = new Date().toISOString();
    const chatSession: StoredChatSession = {
      id: randomUUID(),
      title: buildChatSessionTitle(model.info.displayName ?? model.info.name),
      modelId: model.id,
      modelName: model.info.displayName ?? model.info.name,
      modelAlias: model.alias,
      lastResponseId: null,
      needsContextHydration: false,
      createdAt: now,
      updatedAt: now,
      messages: []
    };

    this.chatSessionsState = {
      activeSessionId: chatSession.id,
      sessions: [chatSession, ...chatSessionsState.sessions]
    };

    await this.persistChatSessionsState();

    return toChatSessionDetailView(chatSession);
  }

  async createTranscriptSession(modelId: string): Promise<FoundryTranscriptSessionDetailView> {
    await this.initialize();

    if (!this.manager) {
      throw new Error('Foundry Local manager is unavailable.');
    }

    const model = await this.manager.catalog.getModelVariant(modelId);

    if (!model.isCached) {
      throw new Error('Only downloaded models can be used for transcript sessions.');
    }

    if (!supportsLiveTranscription(model)) {
      throw new Error('Only audio transcription models can be used for transcript sessions.');
    }

    const transcriptSessionsState = await this.readTranscriptSessionsState();
    const now = new Date().toISOString();
    const transcriptSession: StoredTranscriptSession = {
      id: randomUUID(),
      title: buildTranscriptSessionTitle(model.info.displayName ?? model.info.name),
      modelId: model.id,
      modelName: model.info.displayName ?? model.info.name,
      modelAlias: model.alias,
      createdAt: now,
      updatedAt: now,
      entries: []
    };

    this.transcriptSessionsState = {
      activeSessionId: transcriptSession.id,
      sessions: [transcriptSession, ...transcriptSessionsState.sessions]
    };

    await this.persistTranscriptSessionsState();

    return toTranscriptSessionDetailView(transcriptSession, false);
  }

  async updateChatSessionModel(sessionId: string, modelId: string): Promise<FoundryChatSessionDetailView> {
    await this.initialize();

    if (!this.manager) {
      throw new Error('Foundry Local manager is unavailable.');
    }

    const chatSessionsState = await this.readChatSessionsState();
    const sessionIndex = chatSessionsState.sessions.findIndex((session) => session.id === sessionId);

    if (sessionIndex === -1) {
      throw new Error('Chat session not found.');
    }

    const chatSession = chatSessionsState.sessions[sessionIndex];

    if (chatSession.messages.length > 0) {
      throw new Error('Only empty sessions can change models.');
    }

    if (await this.isAnyModelLoaded()) {
      throw new Error('Unload the currently loaded model before changing session models.');
    }

    const model = await this.manager.catalog.getModelVariant(modelId);

    if (!model.isCached) {
      throw new Error('Only downloaded models can be used for chat sessions.');
    }

    if (!supportsTextChat(model)) {
      throw new Error('Only text chat models can be used for chat sessions.');
    }

    chatSession.modelId = model.id;
    chatSession.modelName = model.info.displayName ?? model.info.name;
    chatSession.modelAlias = model.alias;
    chatSession.title = buildChatSessionTitle(chatSession.modelName);
    chatSession.lastResponseId = null;
    chatSession.needsContextHydration = false;
    chatSession.updatedAt = new Date().toISOString();

    await this.persistChatSessionsState();

    return toChatSessionDetailView(chatSession);
  }

  async updateTranscriptSessionModel(sessionId: string, modelId: string): Promise<FoundryTranscriptSessionDetailView> {
    await this.initialize();

    if (!this.manager) {
      throw new Error('Foundry Local manager is unavailable.');
    }

    const transcriptSessionsState = await this.readTranscriptSessionsState();
    const sessionIndex = transcriptSessionsState.sessions.findIndex((session) => session.id === sessionId);

    if (sessionIndex === -1) {
      throw new Error('Transcript session not found.');
    }

    const transcriptSession = transcriptSessionsState.sessions[sessionIndex];

    if (transcriptSession.entries.length > 0) {
      throw new Error('Only empty sessions can change models.');
    }

    if (this.activeTranscriptRuntime?.sessionId === transcriptSession.id) {
      throw new Error('Stop the live transcription before changing models.');
    }

    if (await this.isAnyModelLoaded()) {
      throw new Error('Unload the currently loaded model before changing session models.');
    }

    const model = await this.manager.catalog.getModelVariant(modelId);

    if (!model.isCached) {
      throw new Error('Only downloaded models can be used for transcript sessions.');
    }

    if (!supportsLiveTranscription(model)) {
      throw new Error('Only audio transcription models can be used for transcript sessions.');
    }

    transcriptSession.modelId = model.id;
    transcriptSession.modelName = model.info.displayName ?? model.info.name;
    transcriptSession.modelAlias = model.alias;
    transcriptSession.title = buildTranscriptSessionTitle(transcriptSession.modelName);
    transcriptSession.updatedAt = new Date().toISOString();

    await this.persistTranscriptSessionsState();

    return toTranscriptSessionDetailView(transcriptSession, false);
  }

  async deleteChatSession(sessionId: string): Promise<FoundryChatView> {
    await this.initialize();

    const chatSessionsState = await this.readChatSessionsState();
    const nextSessions = chatSessionsState.sessions.filter((session) => session.id !== sessionId);

    this.chatSessionsState = {
      activeSessionId: chatSessionsState.activeSessionId === sessionId ? nextSessions[0]?.id ?? null : chatSessionsState.activeSessionId,
      sessions: nextSessions
    };

    await this.persistChatSessionsState();

    return {
      sessions: await this.toChatSessionViews(nextSessions),
      activeSessionId: this.chatSessionsState.activeSessionId
    };
  }

  async deleteTranscriptSession(sessionId: string): Promise<FoundryTranscriptView> {
    await this.initialize();

    if (this.activeTranscriptRuntime?.sessionId === sessionId) {
      await this.stopTranscriptSession(sessionId);
    }

    const transcriptSessionsState = await this.readTranscriptSessionsState();
    const nextSessions = transcriptSessionsState.sessions.filter((session) => session.id !== sessionId);

    this.transcriptSessionsState = {
      activeSessionId: transcriptSessionsState.activeSessionId === sessionId ? nextSessions[0]?.id ?? null : transcriptSessionsState.activeSessionId,
      sessions: nextSessions
    };

    await this.persistTranscriptSessionsState();

    return {
      sessions: await this.toTranscriptSessionViews(nextSessions),
      activeSessionId: this.transcriptSessionsState.activeSessionId
    };
  }

  async loadChatSessionModel(sessionId: string): Promise<FoundryChatView> {
    await this.initialize();

    if (!this.manager) {
      throw new Error('Foundry Local manager is unavailable.');
    }

    const chatSession = await this.requireStoredChatSession(sessionId);
    const model = await this.manager.catalog.getModelVariant(chatSession.modelId);

    if (!model.isCached) {
      throw new Error(`The model for this session is no longer downloaded: ${chatSession.modelName}.`);
    }

    if (!(await model.isLoaded())) {
      await model.load();
    }

    await this.getAppState();

    return this.getChatSessions();
  }

  async loadTranscriptSessionModel(sessionId: string): Promise<FoundryTranscriptView> {
    await this.initialize();

    if (!this.manager) {
      throw new Error('Foundry Local manager is unavailable.');
    }

    const transcriptSession = await this.requireStoredTranscriptSession(sessionId);
    const model = await this.manager.catalog.getModelVariant(transcriptSession.modelId);

    if (!model.isCached) {
      throw new Error(`The model for this session is no longer downloaded: ${transcriptSession.modelName}.`);
    }

    if (!(await model.isLoaded())) {
      await model.load();
    }

    await this.getAppState();

    return this.getTranscriptSessions();
  }

  async unloadChatSessionModel(sessionId: string): Promise<FoundryChatView> {
    await this.initialize();

    if (!this.manager) {
      throw new Error('Foundry Local manager is unavailable.');
    }

    const chatSession = await this.requireStoredChatSession(sessionId);
    const model = await this.manager.catalog.getModelVariant(chatSession.modelId);

    if (await model.isLoaded()) {
      await model.unload();
    }

    await this.markSessionsForModelAsNeedingHydration(chatSession.modelId);

    await this.getAppState();

    return this.getChatSessions();
  }

  async unloadTranscriptSessionModel(sessionId: string): Promise<FoundryTranscriptView> {
    await this.initialize();

    if (!this.manager) {
      throw new Error('Foundry Local manager is unavailable.');
    }

    const transcriptSession = await this.requireStoredTranscriptSession(sessionId);

    if (this.activeTranscriptRuntime?.sessionId === transcriptSession.id) {
      await this.stopTranscriptSession(sessionId);
    }

    const model = await this.manager.catalog.getModelVariant(transcriptSession.modelId);

    if (await model.isLoaded()) {
      await model.unload();
    }

    await this.getAppState();

    return this.getTranscriptSessions();
  }

  async sendChatMessage(sessionId: string, message: string): Promise<FoundryChatSendResultView> {
    await this.initialize();

    if (!this.manager) {
      throw new Error('Foundry Local manager is unavailable.');
    }

    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      throw new Error('Message cannot be empty.');
    }

    const chatSessionsState = await this.readChatSessionsState();
    const sessionIndex = chatSessionsState.sessions.findIndex((session) => session.id === sessionId);

    if (sessionIndex === -1) {
      throw new Error('Chat session not found.');
    }

    const chatSession = chatSessionsState.sessions[sessionIndex];
    const model = await this.manager.catalog.getModelVariant(chatSession.modelId);

    if (!model.isCached) {
      throw new Error(`The model for this session is no longer downloaded: ${chatSession.modelName}.`);
    }

    if (!(await model.isLoaded())) {
      throw new Error(`Load ${chatSession.modelName} before sending messages in this session.`);
    }

    if (!this.manager.isWebServiceRunning) {
      this.manager.startWebService();
    }

    const responsesClient = this.manager.createResponsesClient(chatSession.modelId);
    const userMessage: FoundryChatMessageView = {
      id: randomUUID(),
      role: 'user',
      content: trimmedMessage,
      createdAt: new Date().toISOString()
    };

    chatSession.messages.push(userMessage);
    chatSession.updatedAt = userMessage.createdAt;
    chatSessionsState.activeSessionId = chatSession.id;
    await this.persistChatSessionsState();

    try {
      const assistantMessageId = randomUUID();
      const assistantMessage: FoundryChatMessageView = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString()
      };
      let responseId: string | null = null;

      chatSession.messages.push(assistantMessage);
      chatSession.updatedAt = assistantMessage.createdAt;
      await this.persistChatSessionsState();
      this.emitChatStreamEvent({
        type: 'assistant-message-started',
        sessionId: chatSession.id,
        message: { ...assistantMessage }
      });

      const shouldReplayTranscript = chatSession.needsContextHydration || chatSession.lastResponseId === null;
      const requestInput: string | ResponseInputItem[] = shouldReplayTranscript
        ? toResponseInputItems(chatSession.messages)
        : trimmedMessage;
      const requestOptions = shouldReplayTranscript
        ? { store: true }
        : {
          previous_response_id: chatSession.lastResponseId ?? undefined,
          store: true
        };

      await responsesClient.createStreaming(requestInput, (event) => {
        if (event.type === 'response.output_text.delta') {
          assistantMessage.content += event.delta;
          this.emitChatStreamEvent({
            type: 'assistant-message-delta',
            sessionId: chatSession.id,
            messageId: assistantMessage.id,
            delta: event.delta
          });
        }

        if (event.type === 'response.refusal.delta') {
          assistantMessage.content += event.delta;
          this.emitChatStreamEvent({
            type: 'assistant-message-delta',
            sessionId: chatSession.id,
            messageId: assistantMessage.id,
            delta: event.delta
          });
        }

        if (event.type === 'response.completed') {
          responseId = event.response.id;

          if (!assistantMessage.content) {
            assistantMessage.content = getOutputText(event.response);
          }
        }

        if (event.type === 'error') {
          throw new Error(event.message ?? 'Chat request failed.');
        }
      }, requestOptions);

      if (!assistantMessage.content) {
        assistantMessage.content = 'No response text returned.';
      }

      chatSession.lastResponseId = responseId;
      chatSession.needsContextHydration = false;
      chatSession.updatedAt = new Date().toISOString();

      if (chatSession.messages.length === 2) {
        chatSession.title = buildChatSessionTitle(trimmedMessage);
      }

      await this.persistChatSessionsState();
      this.emitChatStreamEvent({
        type: 'assistant-message-completed',
        sessionId: chatSession.id,
        messageId: assistantMessage.id,
        responseId
      });

      return {
        session: toChatSessionDetailView(chatSession)
      };
    } catch (error) {
      const failedAssistantMessage: FoundryChatMessageView = {
        id: randomUUID(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Chat request failed.',
        createdAt: new Date().toISOString(),
        failed: true
      };

      chatSession.messages.push(failedAssistantMessage);
      chatSession.updatedAt = failedAssistantMessage.createdAt;
      await this.persistChatSessionsState();
      this.emitChatStreamEvent({
        type: 'assistant-message-failed',
        sessionId: chatSession.id,
        message: { ...failedAssistantMessage }
      });

      throw error;
    }
  }

  async startTranscriptSession(sessionId: string): Promise<FoundryTranscriptSessionDetailView> {
    await this.initialize();

    if (!this.manager) {
      throw new Error('Foundry Local manager is unavailable.');
    }

    if (this.activeTranscriptRuntime) {
      if (this.activeTranscriptRuntime.sessionId === sessionId) {
        const currentSession = await this.requireStoredTranscriptSession(sessionId);
        return toTranscriptSessionDetailView(currentSession, true);
      }

      throw new Error('Only one live transcription session can run at a time.');
    }

    const transcriptSession = await this.requireStoredTranscriptSession(sessionId);
    const model = await this.manager.catalog.getModelVariant(transcriptSession.modelId);

    if (!model.isCached) {
      throw new Error(`The model for this session is no longer downloaded: ${transcriptSession.modelName}.`);
    }

    if (!supportsLiveTranscription(model)) {
      throw new Error(`The selected model does not support live transcription: ${transcriptSession.modelName}.`);
    }

    if (!(await model.isLoaded())) {
      throw new Error(`Load ${transcriptSession.modelName} before starting transcription in this session.`);
    }

    const audioSettings = await this.readAudioSettings();
    const naudiodon = await this.importNaudiodon();
    const audioClient = (model as IModel & { createAudioClient(): AudioClientLike }).createAudioClient();

    if (audioClient.settings) {
      audioClient.settings.language = audioSettings.language || undefined;
    }

    const liveSession = audioClient.createLiveTranscriptionSession();
    liveSession.settings.sampleRate = audioSettings.sampleRate;
    liveSession.settings.channels = audioSettings.channels;
    liveSession.settings.bitsPerSample = audioSettings.bitsPerSample;
    liveSession.settings.language = audioSettings.language || undefined;

    const sampleFormat = audioSettings.bitsPerSample === 16 ? naudiodon.SampleFormat16Bit : naudiodon.SampleFormat32Bit;
    const audioInput = naudiodon.AudioIO({
      inOptions: {
        deviceId: audioSettings.selectedInputDeviceId ?? undefined,
        channelCount: audioSettings.channels,
        sampleFormat,
        sampleRate: audioSettings.sampleRate,
        framesPerBuffer: Math.max(1, Math.floor(audioSettings.sampleRate / 5)),
        maxQueue: 64,
        closeOnError: true
      }
    });

    const runtime: ActiveTranscriptRuntime = {
      sessionId: transcriptSession.id,
      modelId: transcriptSession.modelId,
      session: liveSession,
      audioInput,
      previewText: '',
      appendQueue: [],
      pumpError: null,
      pumping: false,
      stopRequested: false,
      lifecyclePromise: null,
      stopPromise: null
    };

    this.activeTranscriptRuntime = runtime;
    this.emitTranscriptStreamEvent({
      type: 'transcription-started',
      sessionId: transcriptSession.id
    });

    audioInput.on('data', (buffer: Buffer) => {
      if (this.activeTranscriptRuntime !== runtime || runtime.stopRequested) {
        return;
      }

      const copy = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength).slice();

      if (runtime.appendQueue.length >= 100) {
        runtime.appendQueue.shift();
      }

      runtime.appendQueue.push(copy);
      void this.pumpTranscriptAudio(runtime);
    });

    audioInput.on('error', (error: unknown) => {
      runtime.pumpError = error;
      void this.failTranscriptRuntime(runtime, error instanceof Error ? error.message : 'Audio capture failed.');
    });

    await liveSession.start();
    audioInput.start();

    runtime.lifecyclePromise = this.consumeTranscriptStream(runtime);

    return toTranscriptSessionDetailView(transcriptSession, true);
  }

  async stopTranscriptSession(sessionId: string): Promise<FoundryTranscriptSessionDetailView> {
    await this.initialize();

    const transcriptSession = await this.requireStoredTranscriptSession(sessionId);
    const runtime = this.activeTranscriptRuntime;

    if (!runtime || runtime.sessionId !== sessionId) {
      return toTranscriptSessionDetailView(transcriptSession, false);
    }

    if (!runtime.stopPromise) {
      runtime.stopRequested = true;
      runtime.stopPromise = this.stopTranscriptRuntime(runtime);
    }

    await runtime.stopPromise;

    const nextSession = await this.requireStoredTranscriptSession(sessionId);
    return toTranscriptSessionDetailView(nextSession, false);
  }

  async mutateCatalogModel(modelId: string, action: FoundryCatalogAction): Promise<FoundryCatalogView> {
    await this.initialize();

    if (!this.manager) {
      return { models: [] };
    }

    const model = await this.manager.catalog.getModelVariant(modelId);

    if (action === 'download') {
      this.emitDownloadProgress({ modelId, progress: 0 });
      await model.download((progress) => {
        this.emitDownloadProgress({ modelId, progress });
      });
      this.emitDownloadProgress({ modelId, progress: 100 });
    } else if (action === 'remove') {
      model.removeFromCache();
      await this.markSessionsForModelAsNeedingHydration(model.id);
    } else if (action === 'load') {
      await model.load();
    } else {
      await model.unload();
      await this.markSessionsForModelAsNeedingHydration(model.id);
    }

    await this.getAppState();

    return this.refreshCatalog();
  }

  subscribeToDownloadProgress(listener: (event: FoundryDownloadProgressEvent) => void): () => void {
    this.downloadProgressListeners.add(listener);

    return () => {
      this.downloadProgressListeners.delete(listener);
    };
  }

  subscribeToEpDownloadProgress(listener: (event: FoundryEpDownloadProgressEvent) => void): () => void {
    this.epDownloadProgressListeners.add(listener);

    return () => {
      this.epDownloadProgressListeners.delete(listener);
    };
  }

  subscribeToChatStream(listener: (event: FoundryChatStreamEvent) => void): () => void {
    this.chatStreamListeners.add(listener);

    return () => {
      this.chatStreamListeners.delete(listener);
    };
  }

  subscribeToTranscriptStream(listener: (event: FoundryTranscriptStreamEvent) => void): () => void {
    this.transcriptStreamListeners.add(listener);

    return () => {
      this.transcriptStreamListeners.delete(listener);
    };
  }

  private async initializeInternal(): Promise<void> {
    try {
      const startupConfig = this.getStartupConfig();

      this.manager = await FoundryLocalManager.createAsync(startupConfig);
      try {
        await this.restoreExecutionProviders();
      } catch (error) {
        this.state = {
          ...this.state,
          lastError: toErrorView(error)
        };
      }
      this.state = {
        ...this.state,
        startupConfigSummary: this.buildStartupConfigSummary(),
        bootstrapStage: 'ready',
        sdkStage: 'ready',
        webServiceStage: this.manager.isWebServiceRunning ? 'running' : 'stopped',
        webServiceUrls: this.manager.urls
      };
    } catch (error) {
      this.recordFailure(error, true);
    }
  }

  private buildStartupConfigSummary(): string {
    const startupConfig = this.getStartupConfig();

    return [
      `appName=${startupConfig.appName}`,
      `appDataDir=${startupConfig.appDataDir ?? 'default'}`,
      `logLevel=${startupConfig.logLevel ?? 'warn'}`,
      'webService=embedded-on-demand'
    ].join(' | ');
  }

  private getStartupConfig(): FoundryLocalConfig {
    if (!this.startupConfig) {
      this.startupConfig = foundryLocalBootstrapConfig;
    }

    return this.startupConfig;
  }

  private async restoreExecutionProviders(): Promise<void> {
    if (!this.manager) {
      return;
    }

    const discoveredProviders = this.manager.discoverEps();
    const availableProviderNames = discoveredProviders.map((provider) => provider.name);

    if (availableProviderNames.length === 0) {
      return;
    }

    const preferredProviders = await this.getPreferredExecutionProviders();
    const providersToRegister = (preferredProviders.length > 0 ? preferredProviders : availableProviderNames)
      .filter((providerName, index, providerNames) => providerNames.indexOf(providerName) === index)
      .filter((providerName) => availableProviderNames.includes(providerName));

    if (providersToRegister.length === 0) {
      return;
    }

    await this.manager.downloadAndRegisterEps(providersToRegister);
    await this.persistRegisteredExecutionProviders();
  }

  private async getPreferredExecutionProviders(): Promise<string[]> {
    const preferences = await this.readEpPreferences();

    return [...preferences.preferredExecutionProviders];
  }

  private async readAudioSettings(): Promise<StoredAudioSettings> {
    if (this.audioSettings) {
      return this.audioSettings;
    }

    try {
      const storedSettings = await readFile(this.getAudioSettingsFilePath(), 'utf8');
      this.audioSettings = normalizeAudioSettings(JSON.parse(storedSettings) as Partial<StoredAudioSettings>);
    } catch {
      this.audioSettings = { ...defaultAudioSettings };
    }

    return this.audioSettings;
  }

  private async persistAudioSettings(): Promise<void> {
    if (!this.audioSettings) {
      return;
    }

    await mkdir(path.dirname(this.getAudioSettingsFilePath()), { recursive: true });
    await writeFile(this.getAudioSettingsFilePath(), JSON.stringify(this.audioSettings, null, 2), 'utf8');
  }

  private getAudioSettingsFilePath(): string {
    return path.join(app.getPath('userData'), audioSettingsFileName);
  }

  private async readEpPreferences(): Promise<FoundryEpPreferences> {
    if (this.epPreferences) {
      return this.epPreferences;
    }

    try {
      const preferencesFile = await readFile(this.getEpPreferencesFilePath(), 'utf8');
      const parsedPreferences = JSON.parse(preferencesFile) as Partial<FoundryEpPreferences>;

      this.epPreferences = {
        preferredExecutionProviders: Array.isArray(parsedPreferences.preferredExecutionProviders)
          ? parsedPreferences.preferredExecutionProviders.filter((value): value is string => typeof value === 'string')
          : []
      };
    } catch {
      this.epPreferences = {
        preferredExecutionProviders: []
      };
    }

    return this.epPreferences;
  }

  private async persistRegisteredExecutionProviders(): Promise<void> {
    if (!this.manager) {
      return;
    }

    const preferences: FoundryEpPreferences = {
      preferredExecutionProviders: this.manager.discoverEps().filter((provider) => provider.isRegistered).map((provider) => provider.name)
    };

    this.epPreferences = preferences;

    await mkdir(path.dirname(this.getEpPreferencesFilePath()), { recursive: true });
    await writeFile(this.getEpPreferencesFilePath(), JSON.stringify(preferences, null, 2), 'utf8');
  }

  private getEpPreferencesFilePath(): string {
    return path.join(app.getPath('userData'), epPreferencesFileName);
  }

  private async readChatSessionsState(): Promise<StoredChatSessionsState> {
    if (this.chatSessionsState) {
      return this.chatSessionsState;
    }

    try {
      const storedState = await readFile(this.getChatSessionsFilePath(), 'utf8');
      const parsedState = JSON.parse(storedState) as Partial<StoredChatSessionsState>;

      this.chatSessionsState = {
        activeSessionId: typeof parsedState.activeSessionId === 'string' ? parsedState.activeSessionId : null,
        sessions: Array.isArray(parsedState.sessions)
          ? parsedState.sessions.filter(isStoredChatSession).map((session) => ({
            ...session,
            needsContextHydration: session.needsContextHydration ?? (session.lastResponseId !== null)
          }))
          : []
      };
    } catch {
      this.chatSessionsState = {
        activeSessionId: null,
        sessions: []
      };
    }

    return this.chatSessionsState;
  }

  private async readTranscriptSessionsState(): Promise<StoredTranscriptSessionsState> {
    if (this.transcriptSessionsState) {
      return this.transcriptSessionsState;
    }

    try {
      const storedState = await readFile(this.getTranscriptSessionsFilePath(), 'utf8');
      const parsedState = JSON.parse(storedState) as Partial<StoredTranscriptSessionsState>;

      this.transcriptSessionsState = {
        activeSessionId: typeof parsedState.activeSessionId === 'string' ? parsedState.activeSessionId : null,
        sessions: Array.isArray(parsedState.sessions)
          ? parsedState.sessions.filter(isStoredTranscriptSession)
          : []
      };
    } catch {
      this.transcriptSessionsState = {
        activeSessionId: null,
        sessions: []
      };
    }

    return this.transcriptSessionsState;
  }

  private async persistChatSessionsState(): Promise<void> {
    if (!this.chatSessionsState) {
      return;
    }

    await mkdir(path.dirname(this.getChatSessionsFilePath()), { recursive: true });
    await writeFile(this.getChatSessionsFilePath(), JSON.stringify(this.chatSessionsState, null, 2), 'utf8');
  }

  private async persistTranscriptSessionsState(): Promise<void> {
    if (!this.transcriptSessionsState) {
      return;
    }

    await mkdir(path.dirname(this.getTranscriptSessionsFilePath()), { recursive: true });
    await writeFile(this.getTranscriptSessionsFilePath(), JSON.stringify(this.transcriptSessionsState, null, 2), 'utf8');
  }

  private getChatSessionsFilePath(): string {
    return path.join(app.getPath('userData'), chatSessionsFileName);
  }

  private getTranscriptSessionsFilePath(): string {
    return path.join(app.getPath('userData'), transcriptSessionsFileName);
  }

  private async requireChatSession(sessionId: string): Promise<StoredChatSession> {
    const chatSessionsState = await this.readChatSessionsState();
    const chatSession = chatSessionsState.sessions.find((session) => session.id === sessionId);

    if (!chatSession) {
      throw new Error('Chat session not found.');
    }

    chatSessionsState.activeSessionId = chatSession.id;
    await this.persistChatSessionsState();

    return chatSession;
  }

  private async requireStoredChatSession(sessionId: string): Promise<StoredChatSession> {
    const chatSessionsState = await this.readChatSessionsState();
    const chatSession = chatSessionsState.sessions.find((session) => session.id === sessionId);

    if (!chatSession) {
      throw new Error('Chat session not found.');
    }

    return chatSession;
  }

  private async requireTranscriptSession(sessionId: string): Promise<StoredTranscriptSession> {
    const transcriptSessionsState = await this.readTranscriptSessionsState();
    const transcriptSession = transcriptSessionsState.sessions.find((session) => session.id === sessionId);

    if (!transcriptSession) {
      throw new Error('Transcript session not found.');
    }

    transcriptSessionsState.activeSessionId = transcriptSession.id;
    await this.persistTranscriptSessionsState();

    return transcriptSession;
  }

  private async requireStoredTranscriptSession(sessionId: string): Promise<StoredTranscriptSession> {
    const transcriptSessionsState = await this.readTranscriptSessionsState();
    const transcriptSession = transcriptSessionsState.sessions.find((session) => session.id === sessionId);

    if (!transcriptSession) {
      throw new Error('Transcript session not found.');
    }

    return transcriptSession;
  }

  private async markSessionsForModelAsNeedingHydration(modelId: string): Promise<void> {
    const chatSessionsState = await this.readChatSessionsState();
    let didChange = false;

    for (const session of chatSessionsState.sessions) {
      if (session.modelId !== modelId) {
        continue;
      }

      if (!session.needsContextHydration) {
        session.needsContextHydration = true;
        didChange = true;
      }
    }

    if (didChange) {
      await this.persistChatSessionsState();
    }
  }

  private async importNaudiodon(): Promise<NaudiodonModuleLike> {
    const moduleValue = await import('naudiodon2');
    const naudiodon = ('default' in moduleValue ? moduleValue.default : moduleValue) as Partial<NaudiodonModuleLike>;

    if (!naudiodon || typeof naudiodon.AudioIO !== 'function' || typeof naudiodon.getDevices !== 'function') {
      throw new Error('naudiodon2 is unavailable in the Electron main process.');
    }

    return naudiodon as NaudiodonModuleLike;
  }

  private async readAudioInputDevices(): Promise<FoundryAudioInputDeviceView[]> {
    try {
      const naudiodon = await this.importNaudiodon();

      return naudiodon.getDevices()
        .filter((device) => device.maxInputChannels > 0)
        .map((device) => ({
          id: device.id,
          name: device.name,
          hostApiName: device.hostAPIName,
          maxInputChannels: device.maxInputChannels,
          defaultSampleRate: device.defaultSampleRate
        }));
    } catch {
      return [];
    }
  }

  private async consumeTranscriptStream(runtime: ActiveTranscriptRuntime): Promise<void> {
    try {
      for await (const result of runtime.session.getStream()) {
        if (this.activeTranscriptRuntime !== runtime) {
          break;
        }

        const text = getTranscriptText(result);

        if (!text) {
          continue;
        }

        if (result.is_final) {
          const finalText = mergeTranscriptPreview(runtime.previewText, text);
          const transcriptSession = await this.requireStoredTranscriptSession(runtime.sessionId);
          const entry: StoredTranscriptEntry = {
            id: randomUUID(),
            content: finalText,
            createdAt: new Date().toISOString(),
            startTime: typeof result.start_time === 'number' ? result.start_time : null,
            endTime: typeof result.end_time === 'number' ? result.end_time : null
          };

          transcriptSession.entries.push(entry);
          transcriptSession.updatedAt = entry.createdAt;

          if (transcriptSession.entries.length === 1) {
            transcriptSession.title = buildTranscriptSessionTitle(text);
          }

          await this.persistTranscriptSessionsState();
          runtime.previewText = '';
          this.emitTranscriptStreamEvent({
            type: 'transcription-entry-committed',
            sessionId: runtime.sessionId,
            entry: { ...entry }
          });
          this.emitTranscriptStreamEvent({
            type: 'transcription-preview-updated',
            sessionId: runtime.sessionId,
            preview: ''
          });
        } else {
          runtime.previewText = mergeTranscriptPreview(runtime.previewText, text);
          this.emitTranscriptStreamEvent({
            type: 'transcription-preview-updated',
            sessionId: runtime.sessionId,
            preview: runtime.previewText
          });
        }
      }
    } catch (error) {
      if (!runtime.stopRequested) {
        await this.failTranscriptRuntime(runtime, error instanceof Error ? error.message : 'Transcription stream failed.');
      }
    }
  }

  private async pumpTranscriptAudio(runtime: ActiveTranscriptRuntime): Promise<void> {
    if (runtime.pumping || runtime.stopRequested || this.activeTranscriptRuntime !== runtime) {
      return;
    }

    runtime.pumping = true;

    try {
      while (runtime.appendQueue.length > 0 && !runtime.stopRequested && this.activeTranscriptRuntime === runtime) {
        const pcm = runtime.appendQueue.shift();

        if (!pcm) {
          continue;
        }

        await runtime.session.append(pcm);
      }
    } catch (error) {
      runtime.pumpError = error;
      await this.failTranscriptRuntime(runtime, error instanceof Error ? error.message : 'Failed to append microphone audio.');
    } finally {
      runtime.pumping = false;

      if (runtime.appendQueue.length > 0 && !runtime.stopRequested && this.activeTranscriptRuntime === runtime) {
        void this.pumpTranscriptAudio(runtime);
      }
    }
  }

  private async failTranscriptRuntime(runtime: ActiveTranscriptRuntime, message: string): Promise<void> {
    if (this.activeTranscriptRuntime !== runtime) {
      return;
    }

    const transcriptSession = await this.requireStoredTranscriptSession(runtime.sessionId);
    const failedEntry: StoredTranscriptEntry = {
      id: randomUUID(),
      content: message,
      createdAt: new Date().toISOString(),
      startTime: null,
      endTime: null,
      failed: true
    };

    transcriptSession.entries.push(failedEntry);
    transcriptSession.updatedAt = failedEntry.createdAt;
    await this.persistTranscriptSessionsState();
    this.emitTranscriptStreamEvent({
      type: 'transcription-failed',
      sessionId: runtime.sessionId,
      message
    });

    runtime.stopRequested = true;
    runtime.stopPromise ??= this.stopTranscriptRuntime(runtime);
    await runtime.stopPromise;
  }

  private async stopTranscriptRuntime(runtime: ActiveTranscriptRuntime): Promise<void> {
    if (this.activeTranscriptRuntime !== runtime) {
      return;
    }

    runtime.stopRequested = true;

    try {
      await new Promise<void>((resolve) => {
        try {
          runtime.audioInput.quit(resolve);
        } catch {
          resolve();
        }
      });

      await runtime.session.stop();
    } finally {
      try {
        await runtime.lifecyclePromise;
      } catch {
        // Stream cleanup errors are already surfaced via event emission.
      }

      try {
        await runtime.session.dispose();
      } catch {
        // Dispose is best-effort during shutdown.
      }

      if (this.activeTranscriptRuntime === runtime) {
        this.activeTranscriptRuntime = null;
        this.emitTranscriptStreamEvent({
          type: 'transcription-preview-updated',
          sessionId: runtime.sessionId,
          preview: ''
        });
        this.emitTranscriptStreamEvent({
          type: 'transcription-stopped',
          sessionId: runtime.sessionId
        });
      }
    }
  }

  private recordFailure(error: unknown, bootstrapFailed: boolean): void {
    this.state = {
      ...this.state,
      startupConfigSummary: this.buildStartupConfigSummary(),
      bootstrapStage: bootstrapFailed ? 'failed' : this.state.bootstrapStage,
      sdkStage: 'failed',
      lastError: toErrorView(error),
      webServiceStage: 'stopped',
      webServiceUrls: []
    };
  }

  private snapshot(): FoundryAppState {
    return {
      ...this.state,
      webServiceUrls: [...this.state.webServiceUrls],
      lastError: this.state.lastError ? { ...this.state.lastError } : null
    };
  }

  private async readCatalogModels(modelsPromise: Promise<IModel[]>): Promise<FoundryCatalogModelView[]> {
    const models = await modelsPromise;

    return Promise.all(models.map(async (model) => ({
      id: model.id,
      alias: model.alias,
      name: model.info.displayName ?? model.info.name,
      version: String(model.info.version),
      modelType: model.info.modelType,
      task: model.info.task ?? 'Unknown',
      size: model.info.fileSizeMb ? `${model.info.fileSizeMb.toFixed(0)} MB` : 'Unknown',
      contextLength: model.contextLength ? `${model.contextLength.toLocaleString()}` : 'Unknown',
      inputModalities: splitModalities(model.inputModalities),
      outputModalities: splitModalities(model.outputModalities),
      downloaded: model.isCached,
      loaded: await model.isLoaded(),
      supportsTextChat: supportsTextChat(model),
      supportsLiveTranscription: supportsLiveTranscription(model),
      supportsToolCalling: model.supportsToolCalling ?? false
    })));
  }

  private async toChatSessionViews(sessions: StoredChatSession[]): Promise<FoundryChatSessionView[]> {
    return Promise.all(sessions.map(async (chatSession) => toChatSessionView(chatSession, await this.isSessionModelLoaded(chatSession.modelId))));
  }

  private async toTranscriptSessionViews(sessions: StoredTranscriptSession[]): Promise<FoundryTranscriptSessionView[]> {
    return Promise.all(sessions.map(async (transcriptSession) => toTranscriptSessionView(
      transcriptSession,
      await this.isSessionModelLoaded(transcriptSession.modelId),
      this.activeTranscriptRuntime?.sessionId === transcriptSession.id
    )));
  }

  private async isSessionModelLoaded(modelId: string): Promise<boolean> {
    if (!this.manager) {
      return false;
    }

    try {
      const model = await this.manager.catalog.getModelVariant(modelId);

      return await model.isLoaded();
    } catch {
      return false;
    }
  }

  private async isAnyModelLoaded(): Promise<boolean> {
    if (!this.manager) {
      return false;
    }

    const loadedModels = await this.manager.catalog.getLoadedModels();
    return loadedModels.length > 0;
  }

  private emitDownloadProgress(event: FoundryDownloadProgressEvent): void {
    for (const listener of this.downloadProgressListeners) {
      listener(event);
    }
  }

  private emitEpDownloadProgress(event: FoundryEpDownloadProgressEvent): void {
    for (const listener of this.epDownloadProgressListeners) {
      listener(event);
    }
  }

  private emitChatStreamEvent(event: FoundryChatStreamEvent): void {
    for (const listener of this.chatStreamListeners) {
      listener(event);
    }
  }

  private emitTranscriptStreamEvent(event: FoundryTranscriptStreamEvent): void {
    for (const listener of this.transcriptStreamListeners) {
      listener(event);
    }
  }

  private readRuntimeView(): FoundryRuntimeView {
    if (!this.manager) {
      return {
        webServiceRunning: false,
        webServiceUrls: [],
        executionProviders: []
      };
    }

    return {
      webServiceRunning: this.manager.isWebServiceRunning,
      webServiceUrls: [...this.manager.urls],
      executionProviders: this.manager.discoverEps().map(toExecutionProviderView)
    };
  }
}

function toExecutionProviderView(ep: EpInfo) {
  return {
    name: ep.name,
    isRegistered: ep.isRegistered
  };
}

function toChatSessionView(chatSession: StoredChatSession, modelLoaded: boolean): FoundryChatSessionView {
  return {
    id: chatSession.id,
    title: chatSession.title,
    modelId: chatSession.modelId,
    modelName: chatSession.modelName,
    modelAlias: chatSession.modelAlias,
    lastResponseId: chatSession.lastResponseId,
    createdAt: chatSession.createdAt,
    updatedAt: chatSession.updatedAt,
    messageCount: chatSession.messages.length,
    modelLoaded
  };
}

function toTranscriptSessionView(transcriptSession: StoredTranscriptSession, modelLoaded: boolean, isTranscribing: boolean): FoundryTranscriptSessionView {
  return {
    id: transcriptSession.id,
    title: transcriptSession.title,
    modelId: transcriptSession.modelId,
    modelName: transcriptSession.modelName,
    modelAlias: transcriptSession.modelAlias,
    createdAt: transcriptSession.createdAt,
    updatedAt: transcriptSession.updatedAt,
    entryCount: transcriptSession.entries.length,
    modelLoaded,
    isTranscribing
  };
}

function toChatSessionDetailView(chatSession: StoredChatSession): FoundryChatSessionDetailView {
  return {
    session: toChatSessionView(chatSession, false),
    messages: chatSession.messages.map((message) => ({ ...message }))
  };
}

function toTranscriptSessionDetailView(transcriptSession: StoredTranscriptSession, isTranscribing: boolean): FoundryTranscriptSessionDetailView {
  return {
    session: toTranscriptSessionView(transcriptSession, false, isTranscribing),
    entries: transcriptSession.entries.map((entry) => ({ ...entry }))
  };
}

function buildChatSessionTitle(value: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return 'New chat';
  }

  return normalizedValue.length > 48 ? `${normalizedValue.slice(0, 48).trimEnd()}...` : normalizedValue;
}

function buildTranscriptSessionTitle(value: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return 'New transcript';
  }

  return normalizedValue.length > 48 ? `${normalizedValue.slice(0, 48).trimEnd()}...` : normalizedValue;
}

function toResponseInputItems(messages: FoundryChatMessageView[]): ResponseInputItem[] {
  return messages
    .filter((message) => !message.failed && message.content.trim().length > 0)
    .map((message) => ({
    type: 'message',
    role: message.role,
    content: [
      {
        type: 'input_text',
        text: message.content
      }
    ]
    }));
}

function isStoredChatSession(value: unknown): value is StoredChatSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredChatSession>;

  return typeof candidate.id === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.modelId === 'string'
    && typeof candidate.modelName === 'string'
    && typeof candidate.modelAlias === 'string'
    && (typeof candidate.lastResponseId === 'string' || candidate.lastResponseId === null)
    && (candidate.needsContextHydration === undefined || typeof candidate.needsContextHydration === 'boolean')
    && typeof candidate.createdAt === 'string'
    && typeof candidate.updatedAt === 'string'
    && Array.isArray(candidate.messages)
    && candidate.messages.every(isStoredChatMessage);
}

function isStoredTranscriptSession(value: unknown): value is StoredTranscriptSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredTranscriptSession>;

  return typeof candidate.id === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.modelId === 'string'
    && typeof candidate.modelName === 'string'
    && typeof candidate.modelAlias === 'string'
    && typeof candidate.createdAt === 'string'
    && typeof candidate.updatedAt === 'string'
    && Array.isArray(candidate.entries)
    && candidate.entries.every(isStoredTranscriptEntry);
}

function isStoredChatMessage(value: unknown): value is FoundryChatMessageView {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<FoundryChatMessageView>;

  return typeof candidate.id === 'string'
    && (candidate.role === 'user' || candidate.role === 'assistant')
    && typeof candidate.content === 'string'
    && typeof candidate.createdAt === 'string'
    && (candidate.failed === undefined || typeof candidate.failed === 'boolean');
}

function isStoredTranscriptEntry(value: unknown): value is StoredTranscriptEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredTranscriptEntry>;

  return typeof candidate.id === 'string'
    && typeof candidate.content === 'string'
    && typeof candidate.createdAt === 'string'
    && (typeof candidate.startTime === 'number' || candidate.startTime === null)
    && (typeof candidate.endTime === 'number' || candidate.endTime === null)
    && (candidate.failed === undefined || typeof candidate.failed === 'boolean');
}

function toEpDownloadResultView(result: EpDownloadResult): FoundryEpDownloadResultView {
  return {
    success: result.success,
    status: result.status,
    registeredEps: [...result.registeredEps],
    failedEps: [...result.failedEps]
  };
}

function splitModalities(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function getTranscriptText(result: LiveTranscriptionResult): string {
  const firstPart = result.content?.[0];
  const value = firstPart?.text ?? firstPart?.transcript ?? '';

  return value.trim();
}

function mergeTranscriptPreview(currentValue: string, nextValue: string): string {
  const trimmedCurrentValue = currentValue.trim();
  const trimmedNextValue = nextValue.trim();

  if (!trimmedCurrentValue) {
    return trimmedNextValue;
  }

  if (!trimmedNextValue) {
    return trimmedCurrentValue;
  }

  if (trimmedNextValue.startsWith(trimmedCurrentValue)) {
    return trimmedNextValue;
  }

  if (trimmedCurrentValue.endsWith(trimmedNextValue)) {
    return trimmedCurrentValue;
  }

  return `${trimmedCurrentValue} ${trimmedNextValue}`.trim();
}

function normalizeAudioSettings(value: Partial<StoredAudioSettings> | FoundryAudioSettingsInput): StoredAudioSettings {
  const sampleRate = typeof value.sampleRate === 'number' && Number.isFinite(value.sampleRate) ? Math.max(8000, Math.round(value.sampleRate)) : defaultAudioSettings.sampleRate;
  const channels = typeof value.channels === 'number' && Number.isFinite(value.channels) ? Math.max(1, Math.round(value.channels)) : defaultAudioSettings.channels;
  const bitsPerSample = value.bitsPerSample === 32 ? 32 : 16;
  const language = typeof value.language === 'string' ? value.language.trim() : defaultAudioSettings.language;

  return {
    selectedInputDeviceId: typeof value.selectedInputDeviceId === 'number' && Number.isInteger(value.selectedInputDeviceId)
      ? value.selectedInputDeviceId
      : null,
    sampleRate,
    channels,
    bitsPerSample,
    language
  };
}

function supportsTextChat(model: IModel): boolean {
  const task = (model.info.task ?? '').toLowerCase();
  const modelType = (model.info.modelType ?? '').toLowerCase();
  const capabilities = (model.capabilities ?? '').toLowerCase();
  const inputModalities = splitModalities(model.inputModalities).map((value) => value.toLowerCase());
  const outputModalities = splitModalities(model.outputModalities).map((value) => value.toLowerCase());

  const supportsTextInput = inputModalities.length === 0 || inputModalities.includes('text');
  const supportsTextOutput = outputModalities.length === 0 || outputModalities.includes('text');
  const looksLikeChatModel = task.includes('chat')
    || task.includes('text')
    || modelType.includes('chat')
    || modelType.includes('text')
    || modelType.includes('language')
    || capabilities.includes('chat')
    || capabilities.includes('text');

  return supportsTextInput && supportsTextOutput && looksLikeChatModel;
}

function supportsLiveTranscription(model: IModel): boolean {
  const task = (model.info.task ?? '').toLowerCase();
  const modelType = (model.info.modelType ?? '').toLowerCase();
  const capabilities = (model.capabilities ?? '').toLowerCase();
  const inputModalities = splitModalities(model.inputModalities).map((value) => value.toLowerCase());
  const outputModalities = splitModalities(model.outputModalities).map((value) => value.toLowerCase());

  const supportsAudioInput = inputModalities.includes('audio');
  const supportsTextOutput = outputModalities.includes('text') || outputModalities.includes('transcript');
  const looksLikeTranscriptionModel = task.includes('transcrib')
    || task.includes('speech')
    || modelType.includes('speech')
    || modelType.includes('audio')
    || capabilities.includes('speech')
    || capabilities.includes('transcrib');

  return supportsAudioInput && supportsTextOutput && looksLikeTranscriptionModel;
}

export const foundryAppService = new FoundryAppService();
