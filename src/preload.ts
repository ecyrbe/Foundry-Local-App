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
  getAudioSettings: () => ipcRenderer.invoke('foundry-local-app:get-audio-settings'),
  updateAudioSettings: (settings) => ipcRenderer.invoke('foundry-local-app:update-audio-settings', settings),
  getChatSessions: () => ipcRenderer.invoke('foundry-local-app:get-chat-sessions'),
  getChatSession: (sessionId) => ipcRenderer.invoke('foundry-local-app:get-chat-session', sessionId),
  createChatSession: (modelId) => ipcRenderer.invoke('foundry-local-app:create-chat-session', modelId),
  updateChatSessionModel: (sessionId, modelId) => ipcRenderer.invoke('foundry-local-app:update-chat-session-model', sessionId, modelId),
  deleteChatSession: (sessionId) => ipcRenderer.invoke('foundry-local-app:delete-chat-session', sessionId),
  loadChatSessionModel: (sessionId) => ipcRenderer.invoke('foundry-local-app:load-chat-session-model', sessionId),
  unloadChatSessionModel: (sessionId) => ipcRenderer.invoke('foundry-local-app:unload-chat-session-model', sessionId),
  sendChatMessage: (sessionId, message) => ipcRenderer.invoke('foundry-local-app:send-chat-message', sessionId, message),
  stopChatResponse: (sessionId) => ipcRenderer.invoke('foundry-local-app:stop-chat-response', sessionId),
  getTranscriptSessions: () => ipcRenderer.invoke('foundry-local-app:get-transcript-sessions'),
  getTranscriptSession: (sessionId) => ipcRenderer.invoke('foundry-local-app:get-transcript-session', sessionId),
  createTranscriptSession: (modelId) => ipcRenderer.invoke('foundry-local-app:create-transcript-session', modelId),
  updateTranscriptSessionModel: (sessionId, modelId) => ipcRenderer.invoke('foundry-local-app:update-transcript-session-model', sessionId, modelId),
  deleteTranscriptSession: (sessionId) => ipcRenderer.invoke('foundry-local-app:delete-transcript-session', sessionId),
  loadTranscriptSessionModel: (sessionId) => ipcRenderer.invoke('foundry-local-app:load-transcript-session-model', sessionId),
  unloadTranscriptSessionModel: (sessionId) => ipcRenderer.invoke('foundry-local-app:unload-transcript-session-model', sessionId),
  startTranscriptSession: (sessionId) => ipcRenderer.invoke('foundry-local-app:start-transcript-session', sessionId),
  stopTranscriptSession: (sessionId) => ipcRenderer.invoke('foundry-local-app:stop-transcript-session', sessionId),
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
  },
  onChatStreamEvent: (listener) => {
    const wrappedListener = (_event: unknown, streamEvent: Parameters<typeof listener>[0]) => {
      listener(streamEvent);
    };

    ipcRenderer.on('foundry-local-app:chat-stream-event', wrappedListener);

    return () => {
      ipcRenderer.removeListener('foundry-local-app:chat-stream-event', wrappedListener);
    };
  },
  onTranscriptStreamEvent: (listener) => {
    const wrappedListener = (_event: unknown, streamEvent: Parameters<typeof listener>[0]) => {
      listener(streamEvent);
    };

    ipcRenderer.on('foundry-local-app:transcript-stream-event', wrappedListener);

    return () => {
      ipcRenderer.removeListener('foundry-local-app:transcript-stream-event', wrappedListener);
    };
  }
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('foundryLocalApp', foundryLocalAppApi);
} else {
  (globalThis as typeof globalThis & { foundryLocalApp: FoundryAppApi }).foundryLocalApp = foundryLocalAppApi;
}
