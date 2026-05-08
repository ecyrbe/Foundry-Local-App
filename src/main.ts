import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { foundryAppService } from './main/foundry-app-service.js';
import type { FoundryChatStreamEvent, FoundryDownloadProgressEvent, FoundryEpDownloadProgressEvent } from './shared/foundry-state.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
let unsubscribeFromDownloadProgress: (() => void) | null = null;
let unsubscribeFromEpDownloadProgress: (() => void) | null = null;
let unsubscribeFromChatStream: (() => void) | null = null;

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(currentDirPath, 'preload.js'),
      sandbox: false
    }
  });

  window.loadFile(path.join(currentDirPath, '../renderer-dist/index.html'));
};

app.whenReady().then(() => {
  void foundryAppService.initialize();
  unsubscribeFromDownloadProgress = foundryAppService.subscribeToDownloadProgress((progressEvent: FoundryDownloadProgressEvent) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('foundry-local-app:catalog-download-progress', progressEvent);
    }
  });
  unsubscribeFromEpDownloadProgress = foundryAppService.subscribeToEpDownloadProgress((progressEvent: FoundryEpDownloadProgressEvent) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('foundry-local-app:ep-download-progress', progressEvent);
    }
  });
  unsubscribeFromChatStream = foundryAppService.subscribeToChatStream((streamEvent: FoundryChatStreamEvent) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('foundry-local-app:chat-stream-event', streamEvent);
    }
  });

  ipcMain.handle('foundry-local-app:get-app-state', () => foundryAppService.getAppState());
  ipcMain.handle('foundry-local-app:get-catalog', () => foundryAppService.getCatalog());
  ipcMain.handle('foundry-local-app:refresh-catalog', () => foundryAppService.refreshCatalog());
  ipcMain.handle('foundry-local-app:mutate-catalog-model', (_event, modelId: string, action: 'download' | 'remove' | 'load' | 'unload') => foundryAppService.mutateCatalogModel(modelId, action));
  ipcMain.handle('foundry-local-app:get-runtime', () => foundryAppService.getRuntime());
  ipcMain.handle('foundry-local-app:start-web-service', () => foundryAppService.startWebService());
  ipcMain.handle('foundry-local-app:stop-web-service', () => foundryAppService.stopWebService());
  ipcMain.handle('foundry-local-app:register-execution-providers', (_event, epNames?: string[]) => foundryAppService.registerExecutionProviders(epNames));
  ipcMain.handle('foundry-local-app:get-chat-sessions', () => foundryAppService.getChatSessions());
  ipcMain.handle('foundry-local-app:get-chat-session', (_event, sessionId: string) => foundryAppService.getChatSession(sessionId));
  ipcMain.handle('foundry-local-app:create-chat-session', (_event, modelId: string) => foundryAppService.createChatSession(modelId));
  ipcMain.handle('foundry-local-app:delete-chat-session', (_event, sessionId: string) => foundryAppService.deleteChatSession(sessionId));
  ipcMain.handle('foundry-local-app:load-chat-session-model', (_event, sessionId: string) => foundryAppService.loadChatSessionModel(sessionId));
  ipcMain.handle('foundry-local-app:unload-chat-session-model', (_event, sessionId: string) => foundryAppService.unloadChatSessionModel(sessionId));
  ipcMain.handle('foundry-local-app:send-chat-message', (_event, sessionId: string, message: string) => foundryAppService.sendChatMessage(sessionId, message));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  ipcMain.removeHandler('foundry-local-app:get-app-state');
  ipcMain.removeHandler('foundry-local-app:get-catalog');
  ipcMain.removeHandler('foundry-local-app:refresh-catalog');
  ipcMain.removeHandler('foundry-local-app:mutate-catalog-model');
  ipcMain.removeHandler('foundry-local-app:get-runtime');
  ipcMain.removeHandler('foundry-local-app:start-web-service');
  ipcMain.removeHandler('foundry-local-app:stop-web-service');
  ipcMain.removeHandler('foundry-local-app:register-execution-providers');
  ipcMain.removeHandler('foundry-local-app:get-chat-sessions');
  ipcMain.removeHandler('foundry-local-app:get-chat-session');
  ipcMain.removeHandler('foundry-local-app:create-chat-session');
  ipcMain.removeHandler('foundry-local-app:delete-chat-session');
  ipcMain.removeHandler('foundry-local-app:load-chat-session-model');
  ipcMain.removeHandler('foundry-local-app:unload-chat-session-model');
  ipcMain.removeHandler('foundry-local-app:send-chat-message');
  unsubscribeFromDownloadProgress?.();
  unsubscribeFromEpDownloadProgress?.();
  unsubscribeFromChatStream?.();
});
