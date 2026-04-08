const path = require("path");
const { BrowserWindow, screen } = require("electron");
const { saveOpenStatusFloatApiIds } = require("./data");
const {
  buildPublicState,
  emitState,
  getMainWindow,
  getStatusWindow,
  getStatusWindows,
  persistedState,
  removeStatusWindow,
  setStatusFloatState,
  setStatusWindow,
} = require("./store");

const FLOAT_WIDTH = 270;
const FLOAT_HEIGHT = 35;
const FLOAT_GAP = 8;

function getUiUrl(hash) {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    return `${devServerUrl}${hash}`;
  }

  return path.join(__dirname, "..", "..", "dist", "index.html");
}

function clampBoundsToDisplay(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const displayBounds = display.bounds;
  const maxX = displayBounds.x + displayBounds.width - bounds.width;
  const maxY = displayBounds.y + displayBounds.height - bounds.height;

  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, displayBounds.x), maxX),
    y: Math.min(Math.max(bounds.y, displayBounds.y), maxY),
  };
}

function getDisplayBoundsForCursor() {
  const cursorPoint = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(cursorPoint).bounds;
}

function getDefaultStackBounds(index) {
  const bounds = getDisplayBoundsForCursor();

  return {
    width: FLOAT_WIDTH,
    height: FLOAT_HEIGHT,
    x: Math.round(bounds.x + bounds.width - FLOAT_WIDTH),
    y: Math.round(
      bounds.y +
        bounds.height -
        FLOAT_HEIGHT -
        index * (FLOAT_HEIGHT + FLOAT_GAP),
    ),
  };
}

function getOrderedOpenApiIds() {
  return [...(persistedState.openStatusFloatApiIds || [])];
}

async function persistOpenApiIds(apiIds) {
  const normalizedIds = Array.from(new Set(apiIds));
  persistedState.openStatusFloatApiIds = normalizedIds;
  setStatusFloatState({ openApiIds: normalizedIds });
  await saveOpenStatusFloatApiIds(normalizedIds);
}

function createStatusWindow(apiId, bounds) {
  const existingWindow = getStatusWindow(apiId);
  if (existingWindow && !existingWindow.isDestroyed()) {
    return existingWindow;
  }

  const clampedBounds = clampBoundsToDisplay(bounds);
  const statusWindow = new BrowserWindow({
    width: clampedBounds.width,
    height: clampedBounds.height,
    x: clampedBounds.x,
    y: clampedBounds.y,
    minWidth: 180,
    minHeight: 35,
    maxWidth: 420,
    maxHeight: 35,
    frame: false,
    thickFrame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    fullscreenable: false,
    roundedCorners: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });

  statusWindow.apiId = apiId;
  statusWindow.defaultBounds = clampedBounds;

  statusWindow.on("closed", async () => {
    removeStatusWindow(apiId);
    const currentIds = getOrderedOpenApiIds();
    const nextIds = currentIds.filter((id) => id !== apiId);
    if (nextIds.length !== currentIds.length) {
      await persistOpenApiIds(nextIds);
    }
    emitState();
  });

  statusWindow.once("ready-to-show", () => {
    statusWindow.showInactive();
    emitState();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    statusWindow.loadURL(
      `${getUiUrl("/#/status-float")}?apiId=${encodeURIComponent(apiId)}`,
    );
  } else {
    statusWindow.loadFile(getUiUrl(""), {
      hash: `status-float?apiId=${encodeURIComponent(apiId)}`,
    });
  }

  setStatusWindow(statusWindow);
  return statusWindow;
}

async function openStatusFloat(apiId) {
  const currentIds = getOrderedOpenApiIds();
  if (currentIds.includes(apiId)) {
    const currentWindow = getStatusWindow(apiId);
    if (currentWindow && !currentWindow.isDestroyed()) {
      currentWindow.showInactive();
      currentWindow.moveTop();
    }

    setStatusFloatState({ openApiIds: currentIds });
    emitState();
    return buildPublicState();
  }

  const nextIds = [...currentIds, apiId];
  const statusWindow = createStatusWindow(
    apiId,
    getDefaultStackBounds(currentIds.length),
  );
  await persistOpenApiIds(nextIds);

  if (!statusWindow.isVisible()) {
    statusWindow.showInactive();
  }

  statusWindow.moveTop();
  emitState();
  return buildPublicState();
}

async function closeStatusFloat(apiId) {
  if (!apiId) {
    const closeTargets = getStatusWindows();
    if (!closeTargets.length) {
      await persistOpenApiIds([]);
      emitState();
      return buildPublicState();
    }

    await persistOpenApiIds([]);
    closeTargets.forEach((window) => {
      if (!window.isDestroyed()) {
        window.close();
      }
    });

    emitState();
    return buildPublicState();
  }

  const statusWindow = getStatusWindow(apiId);
  if (!statusWindow || statusWindow.isDestroyed()) {
    const nextIds = getOrderedOpenApiIds().filter((id) => id !== apiId);
    await persistOpenApiIds(nextIds);
    emitState();
    return buildPublicState();
  }

  const nextIds = getOrderedOpenApiIds().filter((id) => id !== apiId);
  await persistOpenApiIds(nextIds);
  statusWindow.close();
  return buildPublicState();
}

async function restoreStatusFloats() {
  const openIds = getOrderedOpenApiIds();

  for (const [index, apiId] of openIds.entries()) {
    const window = createStatusWindow(apiId, getDefaultStackBounds(index));
    if (!window.isVisible()) {
      window.showInactive();
    }
  }

  setStatusFloatState({ openApiIds: openIds });
  emitState();
}

function focusMainWindow() {
  const mainWindow = getMainWindow();

  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.setAlwaysOnTop(true);
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();
  mainWindow.setAlwaysOnTop(false);
  return true;
}

module.exports = {
  closeStatusFloat,
  focusMainWindow,
  openStatusFloat,
  restoreStatusFloats,
};
