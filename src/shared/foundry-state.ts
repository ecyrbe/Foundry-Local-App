import { FoundryLocalConfig } from "foundry-local-sdk";

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

export interface FoundryAppApi {
  getAppState: () => Promise<FoundryAppState>;
  getCatalog: () => Promise<FoundryCatalogView>;
  refreshCatalog: () => Promise<FoundryCatalogView>;
  mutateCatalogModel: (modelId: string, action: FoundryCatalogAction) => Promise<FoundryCatalogView>;
}

declare global {
  interface Window {
    foundryLocalApp: FoundryAppApi;
  }
}

export {};
