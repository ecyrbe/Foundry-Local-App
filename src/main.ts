import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { foundryAppService } from './main/foundry-app-service.js';
import type { FoundryDownloadProgressEvent } from './shared/foundry-state.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
let unsubscribeFromDownloadProgress: (() => void) | null = null;

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

  ipcMain.handle('foundry-local-app:get-app-state', () => foundryAppService.getAppState());
  ipcMain.handle('foundry-local-app:get-catalog', () => foundryAppService.getCatalog());
  ipcMain.handle('foundry-local-app:refresh-catalog', () => foundryAppService.refreshCatalog());
  ipcMain.handle('foundry-local-app:mutate-catalog-model', (_event, modelId: string, action: 'download' | 'remove' | 'load' | 'unload') => foundryAppService.mutateCatalogModel(modelId, action));

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
  unsubscribeFromDownloadProgress?.();
});
