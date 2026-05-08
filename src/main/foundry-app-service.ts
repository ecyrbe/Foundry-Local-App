import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { FoundryLocalManager, getOutputText, type EpDownloadResult, type EpInfo, type FoundryLocalConfig, type IModel } from 'foundry-local-sdk';
import {
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
  type FoundryRuntimeView,
  type FoundryErrorView
} from '../shared/foundry-state.js';

const epPreferencesFileName = 'execution-provider-preferences.json';
const chatSessionsFileName = 'chat-sessions.json';

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
  createdAt: string;
  updatedAt: string;
  messages: FoundryChatMessageView[];
}

interface StoredChatSessionsState {
  activeSessionId: string | null;
  sessions: StoredChatSession[];
}

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

  private readonly downloadProgressListeners = new Set<(event: FoundryDownloadProgressEvent) => void>();

  private readonly epDownloadProgressListeners = new Set<(event: FoundryEpDownloadProgressEvent) => void>();

  private readonly chatStreamListeners = new Set<(event: FoundryChatStreamEvent) => void>();

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

  async getChatSessions(): Promise<FoundryChatView> {
    await this.initialize();

    const chatSessionsState = await this.readChatSessionsState();

    return {
      sessions: chatSessionsState.sessions.map(toChatSessionView),
      activeSessionId: chatSessionsState.activeSessionId
    };
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

    const now = new Date().toISOString();
    const chatSession: StoredChatSession = {
      id: randomUUID(),
      title: buildChatSessionTitle(model.info.displayName ?? model.info.name),
      modelId: model.id,
      modelName: model.info.displayName ?? model.info.name,
      modelAlias: model.alias,
      lastResponseId: null,
      createdAt: now,
      updatedAt: now,
      messages: []
    };

    const chatSessionsState = await this.readChatSessionsState();
    this.chatSessionsState = {
      activeSessionId: chatSession.id,
      sessions: [chatSession, ...chatSessionsState.sessions]
    };

    await this.persistChatSessionsState();

    return toChatSessionDetailView(chatSession);
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
      await model.load();
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

      await responsesClient.createStreaming(trimmedMessage, (event) => {
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
      }, {
        previous_response_id: chatSession.lastResponseId ?? undefined,
        store: true
      });

      if (!assistantMessage.content) {
        assistantMessage.content = 'No response text returned.';
      }

      chatSession.lastResponseId = responseId;
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
    } else if (action === 'load') {
      await model.load();
    } else {
      await model.unload();
    }

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
        sessions: Array.isArray(parsedState.sessions) ? parsedState.sessions.filter(isStoredChatSession) : []
      };
    } catch {
      this.chatSessionsState = {
        activeSessionId: null,
        sessions: []
      };
    }

    return this.chatSessionsState;
  }

  private async persistChatSessionsState(): Promise<void> {
    if (!this.chatSessionsState) {
      return;
    }

    await mkdir(path.dirname(this.getChatSessionsFilePath()), { recursive: true });
    await writeFile(this.getChatSessionsFilePath(), JSON.stringify(this.chatSessionsState, null, 2), 'utf8');
  }

  private getChatSessionsFilePath(): string {
    return path.join(app.getPath('userData'), chatSessionsFileName);
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
      supportsToolCalling: model.supportsToolCalling ?? false
    })));
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

function toChatSessionView(chatSession: StoredChatSession): FoundryChatSessionView {
  return {
    id: chatSession.id,
    title: chatSession.title,
    modelId: chatSession.modelId,
    modelName: chatSession.modelName,
    modelAlias: chatSession.modelAlias,
    lastResponseId: chatSession.lastResponseId,
    createdAt: chatSession.createdAt,
    updatedAt: chatSession.updatedAt,
    messageCount: chatSession.messages.length
  };
}

function toChatSessionDetailView(chatSession: StoredChatSession): FoundryChatSessionDetailView {
  return {
    session: toChatSessionView(chatSession),
    messages: chatSession.messages.map((message) => ({ ...message }))
  };
}

function buildChatSessionTitle(value: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return 'New chat';
  }

  return normalizedValue.length > 48 ? `${normalizedValue.slice(0, 48).trimEnd()}...` : normalizedValue;
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
    && typeof candidate.createdAt === 'string'
    && typeof candidate.updatedAt === 'string'
    && Array.isArray(candidate.messages)
    && candidate.messages.every(isStoredChatMessage);
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

export const foundryAppService = new FoundryAppService();
