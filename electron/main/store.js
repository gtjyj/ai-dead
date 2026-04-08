const { randomUUID } = require('crypto');
const { DEFAULT_INTERVAL_SECONDS } = require('./constants');

const persistedState = {
  apis: [],
  intervalSeconds: DEFAULT_INTERVAL_SECONDS,
  monitorMode: 'fixed',
  networkCheckURL: 'https://baidu.com',
  openStatusFloatApiIds: [],
  gistSync: {
    token: '',
    gistId: '',
  },
};

const runtimeState = {
  events: [],
  intervalHandle: null,
  isRunning: false,
  lastRunAt: null,
  networkStatus: {
    checkedAt: null,
    checking: false,
    isOnline: true,
    lastError: '',
  },
  runInFlight: null,
  statusFloat: {
    openApiIds: [],
  },
};

let mainWindow = null;
const statusWindows = new Map();

function setMainWindow(window) {
  mainWindow = window;
}

function getMainWindow() {
  return mainWindow;
}

function setStatusWindow(window) {
  if (!window?.apiId) {
    return;
  }

  statusWindows.set(window.apiId, window);
}

function removeStatusWindow(apiId) {
  if (!apiId) {
    return;
  }

  statusWindows.delete(apiId);
}

function getStatusWindow(apiId) {
  return apiId ? statusWindows.get(apiId) || null : null;
}

function getStatusWindows() {
  return Array.from(statusWindows.values()).filter(
    window => window && !window.isDestroyed(),
  );
}

function setStatusFloatState(nextState) {
  runtimeState.statusFloat = {
    ...runtimeState.statusFloat,
    ...nextState,
  };
}

function buildPublicState() {
  return {
    apis: [...persistedState.apis],
    events: runtimeState.events,
    gistSync: persistedState.gistSync,
    intervalSeconds: persistedState.intervalSeconds,
    monitorMode: persistedState.monitorMode,
    networkCheckURL: persistedState.networkCheckURL,
    networkStatus: runtimeState.networkStatus,
    isRunning: runtimeState.isRunning,
    lastRunAt: runtimeState.lastRunAt,
    statusFloat: runtimeState.statusFloat,
  };
}

function emitState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('monitor:state', buildPublicState());
  }

  getStatusWindows().forEach(window => {
    window.webContents.send('monitor:state', buildPublicState());
  });
}

function addEvent(level, text, apiName) {
  runtimeState.events = [
    {
      id: randomUUID(),
      level,
      text,
      apiName: apiName || null,
      at: new Date().toISOString(),
    },
    ...runtimeState.events,
  ].slice(0, 20);

  emitState();
}

module.exports = {
  addEvent,
  buildPublicState,
  emitState,
  getMainWindow,
  persistedState,
  runtimeState,
  getStatusWindow,
  getStatusWindows,
  removeStatusWindow,
  setMainWindow,
  setStatusFloatState,
  setStatusWindow,
};
