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

export interface FoundryAppApi {
  getAppState: () => Promise<FoundryAppState>;
  getCatalog: () => Promise<FoundryCatalogView>;
  refreshCatalog: () => Promise<FoundryCatalogView>;
  mutateCatalogModel: (modelId: string, action: FoundryCatalogAction) => Promise<FoundryCatalogView>;
  getRuntime: () => Promise<FoundryRuntimeView>;
  startWebService: () => Promise<FoundryRuntimeView>;
  stopWebService: () => Promise<FoundryRuntimeView>;
  registerExecutionProviders: (epNames?: string[]) => Promise<FoundryEpDownloadResultView>;
  onCatalogDownloadProgress: (listener: (event: FoundryDownloadProgressEvent) => void) => () => void;
  onEpDownloadProgress: (listener: (event: FoundryEpDownloadProgressEvent) => void) => () => void;
}

declare global {
  interface Window {
    foundryLocalApp: FoundryAppApi;
  }
}

export {};
