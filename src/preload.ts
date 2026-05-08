import { contextBridge, ipcRenderer } from 'electron';
import type { FoundryAppApi } from './shared/foundry-state.js';

const foundryLocalAppApi: FoundryAppApi = {
  getAppState: () => ipcRenderer.invoke('foundry-local-app:get-app-state'),
  getCatalog: () => ipcRenderer.invoke('foundry-local-app:get-catalog'),
  refreshCatalog: () => ipcRenderer.invoke('foundry-local-app:refresh-catalog'),
  mutateCatalogModel: (modelId, action) => ipcRenderer.invoke('foundry-local-app:mutate-catalog-model', modelId, action),
  getRuntime: () => ipcRenderer.invoke('foundry-local-app:get-runtime'),
  startWebService: () => ipcRenderer.invoke('foundry-local-app:start-web-service'),
  stopWebService: () => ipcRenderer.invoke('foundry-local-app:stop-web-service'),
  registerExecutionProviders: (epNames) => ipcRenderer.invoke('foundry-local-app:register-execution-providers', epNames),
  onCatalogDownloadProgress: (listener) => {
    const wrappedListener = (_event: unknown, progressEvent: Parameters<typeof listener>[0]) => {
      listener(progressEvent);
    };

    ipcRenderer.on('foundry-local-app:catalog-download-progress', wrappedListener);

    return () => {
      ipcRenderer.removeListener('foundry-local-app:catalog-download-progress', wrappedListener);
    };
  },
  onEpDownloadProgress: (listener) => {
    const wrappedListener = (_event: unknown, progressEvent: Parameters<typeof listener>[0]) => {
      listener(progressEvent);
    };

    ipcRenderer.on('foundry-local-app:ep-download-progress', wrappedListener);

    return () => {
      ipcRenderer.removeListener('foundry-local-app:ep-download-progress', wrappedListener);
    };
  }
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('foundryLocalApp', foundryLocalAppApi);
} else {
  (globalThis as typeof globalThis & { foundryLocalApp: FoundryAppApi }).foundryLocalApp = foundryLocalAppApi;
}
