import { app, BrowserWindow, ipcMain, Menu, safeStorage } from 'electron';
import { fileURLToPath } from 'node:url';
import { startServer, server } from './server.mjs';
import { configureRemoteRuntime, stopRemoteConnections } from './remote-service.mjs';

let mainWindow;
let localPort;
let fullWindowBounds;

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 900,
    minHeight: 680,
    show: false,
    title: 'Casta',
    backgroundColor: '#0b0e14',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${localPort}/?desktop=1`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.handle('window:set-view-mode', (event, mode) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !['full', 'compact'].includes(mode)) return false;
  if (mode === 'compact') {
    const current = window.getBounds();
    if (current.width > 600) fullWindowBounds = current;
    const width = 318;
    const height = 690;
    window.setMinimumSize(300, 640);
    window.setBounds({ x: current.x + Math.round((current.width - width) / 2), y: current.y + Math.round((current.height - height) / 2), width, height }, true);
    window.setResizable(false);
  } else {
    const current = window.getBounds();
    const target = fullWindowBounds || { x: current.x, y: current.y, width: 1380, height: 860 };
    window.setResizable(true);
    window.setBounds(target, true);
    window.setMinimumSize(900, 680);
  }
  return true;
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  configureRemoteRuntime({
    dataDirectory: app.getPath('userData'),
    protect: (value) => safeStorage.isEncryptionAvailable()
      ? `keychain:${safeStorage.encryptString(value).toString('base64')}`
      : `plain:${Buffer.from(value, 'utf8').toString('base64')}`,
    unprotect: (value) => value.startsWith('keychain:')
      ? safeStorage.decryptString(Buffer.from(value.slice(9), 'base64'))
      : Buffer.from(value.replace(/^plain:/, ''), 'base64').toString('utf8')
  });
  const localServer = await startServer(41730);
  localPort = localServer.address().port;
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopRemoteConnections();
  if (server.listening) server.close();
});
