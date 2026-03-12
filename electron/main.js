import { app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMenu } from './menu.js';
import { createMainWindow } from './window.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const backendPort = Number(process.env.BACKEND_PORT || 8787);
let backendProcess = null;

const resolveBackendEntry = () => {
  const envEntry = process.env.SELFEED_BACKEND_ENTRY;
  if (envEntry && fs.existsSync(envEntry)) return envEntry;

  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath, 'backend', 'server.mjs'),
    path.join(process.cwd(), 'backend', 'server.mjs')
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
};

const startBackendProcess = () => {
  const backendEntry = resolveBackendEntry();
  if (!backendEntry) {
    console.warn('Backend entry not found, skip backend auto-start');
    return null;
  }

  const isPackaged = app.isPackaged;
  const runtime = isPackaged ? process.execPath : (process.env.SELFEED_NODE_BINARY || 'node');
  const env = {
    ...process.env,
    PORT: String(backendPort)
  };
  if (isPackaged) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }

  const child = spawn(runtime, [backendEntry], {
    stdio: 'inherit',
    env
  });

  child.on('error', (error) => {
    console.error(`Failed to start backend process: ${error?.message || error}`);
  });

  child.on('exit', (code) => {
    if (!app.isQuiting && code !== 0) {
      console.error(`Backend process exited with code ${code ?? 'unknown'}`);
    }
  });

  return child;
};

const createWindowAndLoad = async () => {
  const mainWindow = createMainWindow();
  buildMenu();

  if (isDev) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    await mainWindow.loadFile(indexPath);
  }

  return mainWindow;
};

app.setAppUserModelId('com.selfeed.app');
app.setName('Selfeed');

app.whenReady().then(async () => {
  if (!isDev) {
    backendProcess = startBackendProcess();
  }
  await createWindowAndLoad();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindowAndLoad();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill('SIGTERM');
  }
});
