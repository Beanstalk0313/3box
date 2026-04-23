const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');

let mainWindow;

/**
 * Robustly finds the 'Setup' directory.
 * It checks relative to the source, then relative to the packaged resources, 
 * and finally next to the executable.
 */
function getSetupPath() {
  // 1. Check relative to script (for dev)
  const devPath = path.resolve(path.join(__dirname, '..', 'Setup'));
  if (fs.existsSync(path.join(devPath, 'assets'))) return devPath;

  // 2. Check in resources folder (for packaged app)
  // process.resourcesPath points to the 'resources' folder in a packaged Electron app
  const prodPath = path.resolve(path.join(process.resourcesPath, 'Setup'));
  if (fs.existsSync(path.join(prodPath, 'assets'))) return prodPath;

  // 3. Check next to the .exe
  const exeNeighbor = path.resolve(path.join(path.dirname(process.execPath), 'Setup'));
  if (fs.existsSync(path.join(exeNeighbor, 'assets'))) return exeNeighbor;

  // Fallback to the dev path if nothing is found (will trigger error in rebrand.js)
  return devPath;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    title: '3box Installer'
  });

  mainWindow.loadFile('src/index.html');

  // If a path was passed as an argument (from elevation restart), send it to the renderer
  mainWindow.webContents.on('did-finish-load', () => {
    const lastArg = process.argv[process.argv.length - 1];
    if (lastArg && fs.existsSync(lastArg) && path.isAbsolute(lastArg)) {
      mainWindow.webContents.send('init-path', lastArg);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Returns the path containing the Setup folder
ipcMain.handle('get-app-path', () => {
  return path.dirname(getSetupPath());
});

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled) return null;
  return filePaths[0];
});

ipcMain.on('run-command', (event, { command, args, cwd }) => {
  const child = spawn(command, args, { cwd, shell: true });

  child.stdout.on('data', (data) => {
    event.reply('command-output', data.toString());
  });

  child.stderr.on('data', (data) => {
    event.reply('command-output', `ERROR: ${data.toString()}`);
  });

  child.on('close', (code) => {
    event.reply('command-finished', code);
  });
});

// Runs ResourceHacker with the correct argument format for icon replacement.
ipcMain.on('run-resource-hacker', (event, { rhExe, targetExe, icoPath }) => {
  if (!fs.existsSync(rhExe)) {
    event.reply('command-output', `Error: ResourceHacker not found at: ${rhExe}\n`);
    event.reply('command-finished', 1);
    return;
  }

  if (!fs.existsSync(targetExe)) {
    event.reply('command-output', `Skipping (not found): ${targetExe}\n`);
    event.reply('command-finished', 0);
    return;
  }

  if (!fs.existsSync(icoPath)) {
    event.reply('command-output', `Error: Icon file not found at: ${icoPath}\n`);
    event.reply('command-finished', 1);
    return;
  }

  const cmd = `"${rhExe}" -open "${targetExe}" -save "${targetExe}" -action addoverwrite -res "${icoPath}" -mask ICONGROUP,MAINICON,`;

  event.reply('command-output', `Running: ${cmd}\n`);

  const child = spawn(cmd, [], { shell: true });

  child.stdout.on('data', (data) => {
    event.reply('command-output', data.toString());
  });

  child.stderr.on('data', (data) => {
    event.reply('command-output', `ERROR: ${data.toString()}`);
  });

  child.on('close', (code) => {
    event.reply('command-finished', code);
  });
});

ipcMain.on('launch-tool', (event, toolName) => {
  const setupPath = getSetupPath();
  let toolExec;

  if (toolName === 'cracker') {
    toolExec = path.join(setupPath, 'steam_cracker', 'steam_auto_cracker_gui.exe');
  }

  if (toolExec && fs.existsSync(toolExec)) {
    shell.openPath(toolExec);
  } else {
    event.reply('command-output', `Error: Tool not found at ${toolExec}\n`);
  }
});

ipcMain.handle('check-env', async () => {
  const checks = { git: false, node: true, isAdmin: false };
  
  // Check Git
  try {
    await new Promise((resolve, reject) => {
      exec('git --version', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    checks.git = true;
  } catch (e) {
    checks.git = false;
  }

  // Check Admin
  try {
    await new Promise((resolve, reject) => {
      exec('net session', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    checks.isAdmin = true;
  } catch (e) {
    checks.isAdmin = false;
  }

  return checks;
});

ipcMain.handle('check-path-exists', (event, filePath) => {
  return fs.existsSync(filePath);
});

ipcMain.handle('check-path-writable', async (event, targetPath) => {
  try {
    let checkDir = targetPath;
    // If path doesn't exist, check the nearest existing parent
    while (!fs.existsSync(checkDir) && checkDir !== path.parse(checkDir).root) {
      checkDir = path.dirname(checkDir);
    }
    
    const tempFile = path.join(checkDir, `.3box_write_test_${Date.now()}`);
    fs.writeFileSync(tempFile, 'test');
    fs.unlinkSync(tempFile);
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('request-elevation', (event, targetPath) => {
  const exe = process.executablePath;
  // Use PowerShell to relaunch as Admin, passing the current path as an argument
  const cmd = `Start-Process "${exe}" -ArgumentList """${targetPath}""" -Verb RunAs`;
  
  exec(`powershell -Command "${cmd}"`, (err) => {
    if (!err) {
      app.quit();
    }
  });
});

ipcMain.handle('check-disk-space', async (event, targetPath) => {
  if (typeof fs.statfsSync === 'function') {
    try {
      const stats = fs.statfsSync(targetPath);
      const freeGB = (stats.bavail * stats.bsize) / (1024 * 1024 * 1024);
      return parseFloat(freeGB.toFixed(2));
    } catch (e) {}
  }

  return new Promise((resolve) => {
    try {
      const resolvedPath = path.resolve(targetPath);
      const root = path.parse(resolvedPath).root;
      const driveLetter = root.split(':')[0];

      if (!driveLetter || driveLetter.length !== 1) {
        return resolve(null);
      }

      const psCmd = `[math]::Round((Get-PSDrive ${driveLetter}).Free / 1GB, 2)`;
      exec(`powershell -Command "${psCmd}"`, (error, stdout) => {
        if (error) return resolve(null);
        const output = stdout.trim().replace(',', '.');
        const val = parseFloat(output);
        resolve(isNaN(val) ? null : val);
      });
    } catch (e) {
      resolve(null);
    }
  });
});

ipcMain.handle('delete-folder', (event, folderPath) => {
  try {
    fs.rmSync(folderPath, { recursive: true, force: true });
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.on('run-rebrand', async (event, { installPath }) => {
  const rebrand = require('./rebrand.js');
  try {
    const assetsPath = getSetupPath();
    await rebrand.run(installPath, assetsPath, (msg) => {
      event.reply('command-output', msg + '\n');
    });
    event.reply('command-finished', 0);
  } catch (error) {
    event.reply('command-output', `Rebrand Error: ${error.message}\n`);
    event.reply('command-finished', 1);
  }
});

ipcMain.on('refresh-icon-cache', (event) => {
  event.reply('command-output', 'Killing explorer.exe...\n');

  exec('taskkill /f /im explorer.exe', (killErr, killStdout, killStderr) => {
    if (killStdout) event.reply('command-output', killStdout);

    event.reply('command-output', 'Deleting icon cache files...\n');

    const cacheDir = `%USERPROFILE%\\AppData\\Local\\Microsoft\\Windows\\Explorer`;
    const deleteCmd = `cmd /c "cd /d ${cacheDir} && attrib -h iconcache_*.db && del /f /q iconcache_*.db"`;

    exec(deleteCmd, (delErr, delStdout, delStderr) => {
      if (delStdout) event.reply('command-output', delStdout);
      if (delStderr) event.reply('command-output', `WARN: ${delStderr}`);

      if (delErr) {
        event.reply('command-output', `Note: cache delete returned: ${delErr.message}\n`);
      } else {
        event.reply('command-output', 'Icon cache files deleted.\n');
      }

      event.reply('command-output', 'Restarting explorer.exe...\n');
      try {
        const proc = spawn('explorer.exe', [], { detached: true, stdio: 'ignore' });
        proc.unref();
        event.reply('command-output', 'Explorer restarted. Icon cache refresh complete.\n');
        event.reply('command-finished', 0);
      } catch (err) {
        event.reply('command-output', `Error restarting explorer: ${err.message}\n`);
        event.reply('command-finished', 1);
      }
    });
  });
});

ipcMain.handle('create-desktop-shortcut', async (event, targetExePath) => {
  return new Promise((resolve, reject) => {
    try {
      const desktopPath = app.getPath('desktop');
      const shortcutPath = path.join(desktopPath, '3box-dev.lnk');
      const safeTarget = targetExePath.replace(/'/g, "''");
      const safeDir = path.dirname(targetExePath).replace(/'/g, "''");
      const safeShortcut = shortcutPath.replace(/'/g, "''");

      const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('${safeShortcut}')
$Shortcut.TargetPath = '${safeTarget}'
$Shortcut.WorkingDirectory = '${safeDir}'
$Shortcut.IconLocation = '${safeTarget},0'
$Shortcut.Save()
`;
      const base64 = Buffer.from(psScript, 'utf16le').toString('base64');
      exec(`powershell -EncodedCommand ${base64}`, (error) => {
        if (error) reject(error);
        else resolve(shortcutPath);
      });
    } catch (err) {
      reject(err);
    }
  });
});