const { clipboard, contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('monitorApi', {
  applyApiConfig: payload => ipcRenderer.invoke('monitor:apply-api-config', payload),
  checkNetwork: () => ipcRenderer.invoke('monitor:check-network'),
  clearHistory: () => ipcRenderer.invoke('monitor:clear-history'),
  clearApiHistory: apiId => ipcRenderer.invoke('monitor:clear-api-history', apiId),
  beginWindowDrag: payload => ipcRenderer.invoke('monitor:begin-window-drag', payload),
  closeStatusFloat: apiId => ipcRenderer.invoke('monitor:close-status-float', apiId),
  copyText: value => {
    clipboard.writeText(typeof value === 'string' ? value : '');
    return true;
  },
  deleteApi: apiId => ipcRenderer.invoke('monitor:delete-api', apiId),
  focusMainWindow: () => ipcRenderer.invoke('monitor:focus-main-window'),
  getCurrentWindowBounds: () => ipcRenderer.invoke('monitor:get-current-window-bounds'),
  getBootstrap: () => ipcRenderer.invoke('monitor:get-bootstrap'),
  moveCurrentWindow: position => ipcRenderer.invoke('monitor:move-current-window', position),
  openExternal: url => ipcRenderer.invoke('monitor:open-external', url),
  openStatusFloat: apiId => ipcRenderer.invoke('monitor:open-status-float', apiId),
  resizeCurrentWindow: size => ipcRenderer.invoke('monitor:resize-current-window', size),
  restoreGist: settings => ipcRenderer.invoke('monitor:restore-gist', settings),
  saveApi: payload => ipcRenderer.invoke('monitor:save-api', payload),
  setApiPaused: payload => ipcRenderer.invoke('monitor:set-api-paused', payload),
  syncGist: settings => ipcRenderer.invoke('monitor:sync-gist', settings),
  start: settings => ipcRenderer.invoke('monitor:start', settings),
  stop: () => ipcRenderer.invoke('monitor:stop'),
  testApi: apiId => ipcRenderer.invoke('monitor:test-api', apiId),
  testNow: () => ipcRenderer.invoke('monitor:test-now'),
  endWindowDrag: () => ipcRenderer.invoke('monitor:end-window-drag'),
  updateSettings: settings => ipcRenderer.invoke('monitor:update-settings', settings),
  onStateChange: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('monitor:state', listener);

    return () => {
      ipcRenderer.removeListener('monitor:state', listener);
    };
  },
});
