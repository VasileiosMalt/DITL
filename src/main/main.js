const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { scanProject } = require('../core/scanner');
const { analyzeWithAI } = require('../core/ai-engine');
const { writeParameterToFile } = require('../core/writer');
const { runTests } = require('../core/test-runner');
const { loadSettings, saveSettings } = require('../core/settings');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '../../Ditl_logo.png'),
    backgroundColor: '#1e1e2e',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── Window controls ──
ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('win:close', () => mainWindow?.close());

// ── Settings ──
ipcMain.handle('settings:load', () => loadSettings());
ipcMain.handle('settings:save', (_, s) => saveSettings(s));

// ── Project ──
ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project to Analyze',
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('project:scan', async (_, projectPath) => {
  return scanProject(projectPath);
});

ipcMain.handle('project:analyze', async (_, { projectPath, files, settings }) => {
  return analyzeWithAI(projectPath, files, settings);
});

// ── Parameters ──
ipcMain.handle('param:write', async (_, { filePath, param }) => {
  return writeParameterToFile(filePath, param);
});

ipcMain.handle('param:write-batch', async (_, { changes }) => {
  const results = [];
  for (const { filePath, param } of changes) {
    results.push(await writeParameterToFile(filePath, param));
  }
  return results;
});

// ── Tests ──
ipcMain.handle('test:run', async (_, { projectPath, command }) => {
  return runTests(projectPath, command);
});

// ── Shell ──
ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));
ipcMain.handle('shell:openPath', (_, p) => shell.openPath(p));
