const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),

  // Project
  openProject: () => ipcRenderer.invoke('project:open'),
  scanProject: (p) => ipcRenderer.invoke('project:scan', p),
  analyzeProject: (opts) => ipcRenderer.invoke('project:analyze', opts),

  // Params
  writeParam: (opts) => ipcRenderer.invoke('param:write', opts),
  writeParamBatch: (opts) => ipcRenderer.invoke('param:write-batch', opts),

  // Tests
  runTests: (opts) => ipcRenderer.invoke('test:run', opts),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
});
