const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('castaDesktop', {
  setViewMode: (mode) => ipcRenderer.invoke('window:set-view-mode', mode)
});
