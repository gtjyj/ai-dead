const { ipcMain, screen, shell } = require('electron');
const { applyApiToTarget } = require('./configTargets');
const { closeStatusFloat, focusMainWindow, openStatusFloat } = require('./statusFloat');
const { buildPublicState } = require('./store');
const {
  clearAllTestHistory,
  clearApiTestHistory,
  deleteApiById,
  saveApiPayload,
  setApiPaused,
  updateMonitoringSettings,
} = require('./data');
const { restoreConfigFromGist, syncConfigToGist } = require('./gist');
const { checkNetworkConnectivity } = require('./network');
const {
  refreshMonitoringSchedule,
  runAllChecks,
  runSingleCheckById,
  startMonitoring,
  stopMonitoring,
} = require('./relayCheck');
const { trimText } = require('./lib/text');

const activeWindowDrags = new Map();

function clampWindowPositionToDisplay(bounds, nextPosition) {
  const nextBounds = {
    ...bounds,
    x: Math.round(nextPosition.x),
    y: Math.round(nextPosition.y),
  };
  const display = screen.getDisplayMatching(nextBounds);
  const displayBounds = display.bounds;
  const maxX = displayBounds.x + displayBounds.width - bounds.width;
  const maxY = displayBounds.y + displayBounds.height - bounds.height;

  return {
    x: Math.min(Math.max(nextBounds.x, displayBounds.x), maxX),
    y: Math.min(Math.max(nextBounds.y, displayBounds.y), maxY),
  };
}

function registerMonitorIpc() {
  ipcMain.handle('monitor:get-bootstrap', async () => buildPublicState());
  ipcMain.handle('monitor:save-api', async (_event, payload) => saveApiPayload(payload));
  ipcMain.handle('monitor:delete-api', async (_event, apiId) => deleteApiById(apiId));
  ipcMain.handle('monitor:start', async (_event, settings) => startMonitoring(settings));
  ipcMain.handle('monitor:stop', async () => {
    stopMonitoring();
    return buildPublicState();
  });
  ipcMain.handle('monitor:update-settings', async (_event, settings) => {
    const snapshot = await updateMonitoringSettings(settings);
    await refreshMonitoringSchedule();
    return snapshot;
  });
  ipcMain.handle('monitor:test-api', async (_event, apiId) => runSingleCheckById(apiId));
  ipcMain.handle('monitor:test-now', async () => runAllChecks('manual'));
  ipcMain.handle('monitor:set-api-paused', async (_event, payload) => setApiPaused(payload?.apiId, payload?.paused));
  ipcMain.handle('monitor:clear-history', async () => clearAllTestHistory());
  ipcMain.handle('monitor:clear-api-history', async (_event, apiId) => clearApiTestHistory(apiId));
  ipcMain.handle('monitor:apply-api-config', async (_event, payload) => applyApiToTarget(payload));
  ipcMain.handle('monitor:restore-gist', async (_event, settings) => restoreConfigFromGist(settings));
  ipcMain.handle('monitor:sync-gist', async (_event, settings) => syncConfigToGist(settings));
  ipcMain.handle('monitor:check-network', async () => checkNetworkConnectivity(true));
  ipcMain.handle('monitor:open-status-float', async (_event, apiId) => openStatusFloat(apiId));
  ipcMain.handle('monitor:close-status-float', async (_event, apiId) => closeStatusFloat(apiId));
  ipcMain.handle('monitor:focus-main-window', async () => focusMainWindow());
  ipcMain.handle('monitor:get-current-window-bounds', async event => {
    const window = event.sender.getOwnerBrowserWindow();
    if (!window || window.isDestroyed()) {
      return null;
    }

    return window.getBounds();
  });
  ipcMain.handle('monitor:begin-window-drag', async (event, payload) => {
    const window = event.sender.getOwnerBrowserWindow();
    if (!window || window.isDestroyed()) {
      return false;
    }

    const startCursorX = Number(payload?.screenX);
    const startCursorY = Number(payload?.screenY);
    if (!Number.isFinite(startCursorX) || !Number.isFinite(startCursorY)) {
      return false;
    }

    activeWindowDrags.set(window.webContents.id, {
      startBounds: window.getBounds(),
      startCursorX,
      startCursorY,
      timer: setInterval(() => {
        if (window.isDestroyed()) {
          const dragState = activeWindowDrags.get(window.webContents.id);
          if (dragState?.timer) {
            clearInterval(dragState.timer);
          }
          activeWindowDrags.delete(window.webContents.id);
          return;
        }

        const dragState = activeWindowDrags.get(window.webContents.id);
        if (!dragState) {
          return;
        }

        const cursorPoint = screen.getCursorScreenPoint();
        const nextPosition = clampWindowPositionToDisplay(dragState.startBounds, {
          x: dragState.startBounds.x + (cursorPoint.x - dragState.startCursorX),
          y: dragState.startBounds.y + (cursorPoint.y - dragState.startCursorY),
        });

        window.setPosition(nextPosition.x, nextPosition.y, false);
      }, 8),
    });

    return true;
  });
  ipcMain.handle('monitor:end-window-drag', async event => {
    const window = event.sender.getOwnerBrowserWindow();
    if (!window || window.isDestroyed()) {
      return false;
    }

    const dragState = activeWindowDrags.get(window.webContents.id);
    if (dragState?.timer) {
      clearInterval(dragState.timer);
    }
    activeWindowDrags.delete(window.webContents.id);
    return true;
  });
  ipcMain.handle('monitor:move-current-window', async (event, position) => {
    const window = event.sender.getOwnerBrowserWindow();
    if (!window || window.isDestroyed()) {
      return false;
    }

    const x = Number(position?.x);
    const y = Number(position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return false;
    }

    const nextPosition = clampWindowPositionToDisplay(window.getBounds(), { x, y });
    window.setPosition(nextPosition.x, nextPosition.y, false);
    return true;
  });
  ipcMain.handle('monitor:resize-current-window', async (event, size) => {
    const window = event.sender.getOwnerBrowserWindow();
    if (!window || window.isDestroyed()) {
      return false;
    }

    const width = Math.round(Number(size?.width));
    const height = Math.round(Number(size?.height));
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return false;
    }

    const nextWidth = Math.min(Math.max(width, 180), 420);
    const nextHeight = Math.min(Math.max(height, 40), 120);
    const currentBounds = window.getBounds();
    const nextPosition = clampWindowPositionToDisplay(
      { ...currentBounds, width: nextWidth, height: nextHeight },
      currentBounds,
    );

    window.setBounds(
      {
        x: nextPosition.x,
        y: nextPosition.y,
        width: nextWidth,
        height: nextHeight,
      },
      false,
    );
    return true;
  });
  ipcMain.handle('monitor:open-external', async (_event, url) => {
    const target = trimText(url);
    if (!target) {
      return false;
    }

    await shell.openExternal(target);
    return true;
  });
}

module.exports = {
  registerMonitorIpc,
};
