import { app } from 'electron';
import { FoundryLocalManager, type FoundryLocalConfig, type IModel } from 'foundry-local-sdk';
import {
  foundryLocalBootstrapConfig,
  type FoundryCatalogAction,
  type FoundryCatalogModelView,
  type FoundryCatalogView,
  type FoundryAppState,
  type FoundryErrorView
} from '../shared/foundry-state.js';

const userDataPath = app.getPath('userData');
console.log(`Electron userData path: ${userDataPath}`);

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

  async mutateCatalogModel(modelId: string, action: FoundryCatalogAction): Promise<FoundryCatalogView> {
    await this.initialize();

    if (!this.manager) {
      return { models: [] };
    }

    const model = await this.manager.catalog.getModelVariant(modelId);

    if (action === 'download') {
      await model.download();
    } else if (action === 'remove') {
      model.removeFromCache();
    } else if (action === 'load') {
      await model.load();
    } else {
      await model.unload();
    }

    return this.refreshCatalog();
  }

  private async initializeInternal(): Promise<void> {
    try {
      const startupConfig = this.getStartupConfig();

      this.manager = await FoundryLocalManager.createAsync(startupConfig);
      this.state = {
        ...this.state,
        startupConfigSummary: this.buildStartupConfigSummary(),
        bootstrapStage: 'ready',
        sdkStage: 'ready',
        lastError: null,
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
}

function splitModalities(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export const foundryAppService = new FoundryAppService();
