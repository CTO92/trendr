import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import { initDatabase } from './database';
import { setupIpcHandlers } from './ipc-handlers';
import { BackgroundCollector } from './background';
import { getSettings } from './settings';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let collector: BackgroundCollector | null = null;
let isQuitting = false;

function isDev(): boolean {
  return process.env.NODE_ENV === 'development' || !app.isPackaged;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'default',
    show: false,
  });

  // Load the app
  if (isDev()) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    // Minimize to tray instead of closing
    if (mainWindow && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Create a simple tray icon (will be replaced with actual icon)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Trendr',
      click: () => {
        mainWindow?.show();
      },
    },
    {
      label: 'Collect Now',
      click: async () => {
        if (collector) {
          await collector.runNow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Trendr - Attention Flow Tracker');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow?.show();
  });
}

async function initialize() {
  // Initialize database
  await initDatabase();

  // Set up IPC handlers
  setupIpcHandlers();

  // Create window and tray
  await createWindow();
  createTray();

  // Initialize background collector
  collector = new BackgroundCollector();
  const settings = await getSettings();
  if (settings.reddit) {
    collector.start();
  }
}

// App lifecycle
app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (collector) {
    collector.stop();
  }
});
