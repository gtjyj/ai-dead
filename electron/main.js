const { app, BrowserWindow, Menu } = require('electron');
const { loadPersistedState } = require('./main/data');
const { registerMonitorIpc } = require('./main/ipc');
const { startNetworkMonitoring, stopNetworkMonitoring } = require('./main/network');
const { stopMonitoring } = require('./main/relayCheck');
const { restoreStatusFloats } = require('./main/statusFloat');
const { setMainWindow } = require('./main/store');
const { createMainWindow } = require('./main/window');

registerMonitorIpc();

app.whenReady().then(async () => {
  await loadPersistedState();
  Menu.setApplicationMenu(null);
  setMainWindow(createMainWindow());
  await restoreStatusFloats();
  startNetworkMonitoring();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      setMainWindow(createMainWindow());
    }
  });
});

app.on('before-quit', () => {
  stopNetworkMonitoring();
  stopMonitoring();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
