const path = require('path');
const { BrowserWindow } = require('electron');
const { closeStatusFloat } = require('./statusFloat');

function createMainWindow() {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#f6efe6',
    title: 'Relay Pulse',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '..', 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    closeStatusFloat();
  });

  if (devServerUrl) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') {
        return;
      }

      const isToggleDevTools = input.control && input.shift && input.key.toLowerCase() === 'i';

      if (isToggleDevTools) {
        event.preventDefault();
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    return mainWindow;
  }

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  return mainWindow;
}

module.exports = {
  createMainWindow,
};
