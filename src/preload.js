const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  runCommand: (command, args, cwd) => ipcRenderer.send('run-command', { command, args, cwd }),
  runResourceHacker: (rhExe, targetExe, icoPath) =>
    ipcRenderer.send('run-resource-hacker', { rhExe, targetExe, icoPath }),
  launchTool: (toolName) => ipcRenderer.send('launch-tool', toolName),
  checkEnv: () => ipcRenderer.invoke('check-env'),
  checkPathExists: (filePath) => ipcRenderer.invoke('check-path-exists', filePath),
  checkDiskSpace: (filePath) => ipcRenderer.invoke('check-disk-space', filePath),
  deleteFolder: (folderPath) => ipcRenderer.invoke('delete-folder', folderPath),
  runRebrand: (installPath) => ipcRenderer.send('run-rebrand', { installPath }),
  refreshIconCache: () => ipcRenderer.send('refresh-icon-cache'),
  createDesktopShortcut: (targetPath) => ipcRenderer.invoke('create-desktop-shortcut', targetPath),
  onCommandOutput: (callback) => ipcRenderer.on('command-output', (event, data) => callback(data)),
  onCommandFinished: (callback) => ipcRenderer.on('command-finished', (event, code) => callback(code)),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
