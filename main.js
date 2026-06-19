const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "StreamVault PRO",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Hide the menu bar for a modern look
  mainWindow.setMenuBarVisibility(false);

  // Load the Express server address
  const API_BASE_URL = process.env.API_BASE_URL || process.env.VITE_API_URL || 'http://127.0.0.1:10000';
  mainWindow.loadURL(API_BASE_URL);
  
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function startExpressServer() {
  // Spawn the server as a background process
  const serverPath = path.join(__dirname, 'server.js');
  const env = { 
    ...process.env, 
    NODE_ENV: 'production', 
    PORT: '3000',
    JWT_SECRET: 'streamvault_desktop_local_secret_2026',
    ELECTRON_RUN_AS_NODE: '1'
  };
  
  serverProcess = spawn(process.execPath, [serverPath], { env, windowsHide: true });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Express]: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Express Error]: ${data}`);
  });
}

app.whenReady().then(() => {
  startExpressServer();
  
  // Do not use a hardcoded setTimeout anymore.
  // The serverProcess.stdout listener will trigger createWindow() when ready.
  // But as a fallback, if we miss the log, trigger after 3.5 seconds.
  let windowCreated = false;
  
  if (serverProcess) {
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('listening on') && !windowCreated) {
        windowCreated = true;
        createWindow();
      }
    });
  }

  setTimeout(() => {
    if (!windowCreated) {
      windowCreated = true;
      createWindow();
    }
  }, 3500);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0 && windowCreated) createWindow();
  });
});

app.on('window-all-closed', function () {
  // Gracefully kill the background Express server
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
