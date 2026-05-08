import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FoundryLocalManager, type EpDownloadResult, type EpInfo, type FoundryLocalConfig, type IModel } from 'foundry-local-sdk';
import {
  foundryLocalBootstrapConfig,
  type FoundryCatalogAction,
  type FoundryCatalogModelView,
  type FoundryCatalogView,
  type FoundryAppState,
  type FoundryEpDownloadProgressEvent,
  type FoundryEpDownloadResultView,
  type FoundryDownloadProgressEvent,
  type FoundryRuntimeView,
  type FoundryErrorView
} from '../shared/foundry-state.js';

const epPreferencesFileName = 'execution-provider-preferences.json';

interface FoundryEpPreferences {
  preferredExecutionProviders: string[];
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

  private readonly downloadProgressListeners = new Set<(event: FoundryDownloadProgressEvent) => void>();

  private readonly epDownloadProgressListeners = new Set<(event: FoundryEpDownloadProgressEvent) => void>();

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
