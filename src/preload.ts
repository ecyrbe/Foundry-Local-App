import { contextBridge, ipcRenderer } from 'electron';
import type { FoundryAppApi } from './shared/foundry-state.js';

const foundryLocalAppApi: FoundryAppApi = {
  getAppState: () => ipcRenderer.invoke('foundry-local-app:get-app-state'),
  getCatalog: () => ipcRenderer.invoke('foundry-local-app:get-catalog'),
  refreshCatalog: () => ipcRenderer.invoke('foundry-local-app:refresh-catalog'),
  mutateCatalogModel: (modelId, action) => ipcRenderer.invoke('foundry-local-app:mutate-catalog-model', modelId, action)
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('foundryLocalApp', foundryLocalAppApi);
} else {
  (globalThis as typeof globalThis & { foundryLocalApp: FoundryAppApi }).foundryLocalApp = foundryLocalAppApi;
}
