import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMenu } from './menu.js';
import { createMainWindow } from './window.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

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
