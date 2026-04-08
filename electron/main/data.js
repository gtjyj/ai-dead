const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { app } = require('electron');
const {
  DEFAULT_INTERVAL_SECONDS,
  DEFAULT_REQUEST_TIMEOUT_SECONDS,
  MAX_TEST_HISTORY_ITEMS,
} = require('./constants');
const { addEvent, buildPublicState, emitState, persistedState } = require('./store');
const {
  decryptApiSecrets,
  decryptGistSyncSecrets,
  encryptApiSecrets,
  encryptGistSyncSecrets,
  hasLegacyPlaintextSecrets,
} = require('./lib/secrets');
const { normalizeBaseURL, compactText, trimText } = require('./lib/text');

let dataFilePath = '';

function normalizeNetworkCheckURL(value) {
  const target = trimText(value) || 'https://baidu.com';

  try {
    const parsed = new URL(target);
    return parsed.toString();
  } catch (_error) {
    return 'https://baidu.com';
  }
}

function clampInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_INTERVAL_SECONDS;
  }

  return Math.min(Math.max(Math.round(parsed), 5), 3600);
}

function normalizeMonitorMode(value) {
  return value === 'per-api' ? 'per-api' : 'fixed';
}

function normalizeVendor(value) {
  const vendor = trimText(value).toLowerCase();
  const supportedVendors = new Set([
    'openai',
    'gemini',
    'anthropic',
    'other',
  ]);

  return supportedVendors.has(vendor) ? vendor : 'openai';
}

function clampRequestTimeoutSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_REQUEST_TIMEOUT_SECONDS;
  }

  return Math.min(Math.max(Math.round(parsed), 3), 300);
}

function getRequestTimeoutMs(api) {
  return clampRequestTimeoutSeconds(api?.timeoutSeconds) * 1000;
}

function normalizeTestHistory(testHistory) {
  if (!Array.isArray(testHistory)) {
    return [];
  }

  return testHistory
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      at: item.at || null,
      latencyMs: Number.isFinite(item.latencyMs) ? item.latencyMs : null,
      status: item.status === 'success' ? 'success' : 'error',
      detail: compactText(item.detail || item.message || (item.status === 'success' ? 'OK' : 'No result'), 400),
    }))
    .slice(-MAX_TEST_HISTORY_ITEMS);
}

function appendTestHistory(api, result) {
  return [...normalizeTestHistory(api?.testHistory), result].slice(-MAX_TEST_HISTORY_ITEMS);
}

function getDataFilePath() {
  return path.join(app.getPath('home'), 'relay-pulse.json');
}

function normalizeGistSyncSettings(settings) {
  const decrypted = decryptGistSyncSecrets(settings || {});

  return {
    token: trimText(decrypted?.token),
    gistId: trimText(decrypted?.gistId),
  };
}

function normalizeStatusFloatBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }

  const x = Number(bounds.x);
  const y = Number(bounds.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
  };
}

function normalizeOpenStatusFloatApiIds(apiIds, apis = persistedState.apis) {
  if (!Array.isArray(apiIds)) {
    return [];
  }

  const validApiIds = new Set((apis || []).map(api => api.id));
  return apiIds
    .map(id => trimText(id))
    .filter(id => id && validApiIds.has(id));
}

function buildSyncExportState() {
  return {
    intervalSeconds: persistedState.intervalSeconds,
    monitorMode: persistedState.monitorMode,
    networkCheckURL: persistedState.networkCheckURL,
    apis: persistedState.apis.map(api => encryptApiSecrets({
      id: api.id,
      name: api.name,
      vendor: normalizeVendor(api.vendor),
      baseURL: api.baseURL,
      websiteURL: trimText(api.websiteURL),
      accountName: typeof api.accountName === 'string' ? api.accountName : '',
      accountPassword: typeof api.accountPassword === 'string' ? api.accountPassword : '',
      apiKey: api.apiKey,
      model: api.model,
      paused: Boolean(api.paused),
      checkIntervalSeconds: clampInterval(api.checkIntervalSeconds),
      lastAutoCheckAt: api.lastAutoCheckAt || null,
      timeoutSeconds: clampRequestTimeoutSeconds(api.timeoutSeconds),
      createdAt: api.createdAt || null,
      updatedAt: api.updatedAt || null,
    })),
    exportedAt: new Date().toISOString(),
    source: 'relay-pulse',
    version: 1,
  };
}

async function savePersistedState() {
  const serializedApis = persistedState.apis.map(api => encryptApiSecrets(api));
  const serializedGistSync = encryptGistSyncSecrets(persistedState.gistSync);

  await fs.writeFile(
    dataFilePath,
    JSON.stringify(
        {
          apis: serializedApis,
          gistSync: serializedGistSync,
          intervalSeconds: persistedState.intervalSeconds,
          monitorMode: persistedState.monitorMode,
          networkCheckURL: persistedState.networkCheckURL,
          openStatusFloatApiIds: persistedState.openStatusFloatApiIds,
        },
      null,
      2,
    ),
    'utf8',
  );
}

async function loadPersistedState() {
  dataFilePath = getDataFilePath();

  try {
    const raw = await fs.readFile(dataFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    const shouldRewriteEncryptedState = hasLegacyPlaintextSecrets(parsed);

    persistedState.apis = Array.isArray(parsed.apis)
      ? parsed.apis.map(rawApi => ({
          ...decryptApiSecrets(rawApi),
          vendor: normalizeVendor(rawApi.vendor),
          paused: Boolean(rawApi.paused),
          checkIntervalSeconds: clampInterval(rawApi.checkIntervalSeconds),
          lastAutoCheckAt: rawApi.lastAutoCheckAt || null,
          timeoutSeconds: clampRequestTimeoutSeconds(rawApi.timeoutSeconds),
          testHistory: normalizeTestHistory(rawApi.testHistory),
        }))
      : [];
    persistedState.gistSync = normalizeGistSyncSettings(parsed.gistSync);
    persistedState.intervalSeconds = clampInterval(parsed.intervalSeconds);
    persistedState.monitorMode = normalizeMonitorMode(parsed.monitorMode);
    persistedState.networkCheckURL = normalizeNetworkCheckURL(parsed.networkCheckURL);
    persistedState.openStatusFloatApiIds = normalizeOpenStatusFloatApiIds(parsed.openStatusFloatApiIds, persistedState.apis);

    if (shouldRewriteEncryptedState) {
      await savePersistedState();
    }
  } catch (_error) {
    persistedState.apis = [];
    persistedState.gistSync = normalizeGistSyncSettings();
    persistedState.intervalSeconds = DEFAULT_INTERVAL_SECONDS;
    persistedState.monitorMode = 'fixed';
    persistedState.networkCheckURL = normalizeNetworkCheckURL();
    persistedState.openStatusFloatApiIds = [];
    await savePersistedState();
  }
}

async function saveOpenStatusFloatApiIds(apiIds) {
  persistedState.openStatusFloatApiIds = normalizeOpenStatusFloatApiIds(apiIds);
  await savePersistedState();
  return persistedState.openStatusFloatApiIds;
}

function updateApiRecord(apiId, updates) {
  persistedState.apis = persistedState.apis.map(api => {
    if (api.id !== apiId) {
      return api;
    }

    return {
      ...api,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
  });
}

async function clearAllTestHistory() {
  const timestamp = new Date().toISOString();

  persistedState.apis = persistedState.apis.map(api => ({
    ...api,
    testHistory: [],
    updatedAt: timestamp,
  }));

  await savePersistedState();
  addEvent('info', '已清除全部历史测试结果。');
  emitState();
  return buildPublicState();
}

function validateApiPayload(payload) {
  const name = trimText(payload?.name);
  const vendor = normalizeVendor(payload?.vendor);
  const baseURL = normalizeBaseURL(payload?.baseURL);
  const apiKey = trimText(payload?.apiKey);
  const model = trimText(payload?.model);
  const websiteURL = trimText(payload?.websiteURL);
  const accountName = typeof payload?.accountName === 'string' ? payload.accountName : '';
  const accountPassword = typeof payload?.accountPassword === 'string' ? payload.accountPassword : '';
  const checkIntervalSeconds = clampInterval(payload?.checkIntervalSeconds);
  const timeoutSeconds = clampRequestTimeoutSeconds(payload?.timeoutSeconds);

  if (!name || !baseURL || !apiKey || !model) {
    throw new Error('请完整填写名称、Base URL、API Key 和模型。');
  }

  if (!/^[A-Za-z0-9 _.-]+$/.test(name)) {
    throw new Error('名称仅支持英文字符、数字、空格、点、下划线和短横线。');
  }

  try {
    new URL(baseURL);
  } catch (_error) {
    throw new Error('Base URL 格式不正确。');
  }

  if (websiteURL) {
    try {
      new URL(websiteURL);
    } catch (_error) {
      throw new Error('官网地址格式不正确。');
    }
  }

  return {
    name,
    vendor,
    baseURL,
    apiKey,
    model,
    websiteURL,
    accountName,
    accountPassword,
    checkIntervalSeconds,
    timeoutSeconds,
  };
}

async function updateMonitoringSettings(payload) {
  persistedState.intervalSeconds = clampInterval(payload?.intervalSeconds);
  persistedState.monitorMode = normalizeMonitorMode(payload?.monitorMode);
  persistedState.networkCheckURL = normalizeNetworkCheckURL(payload?.networkCheckURL);
  await savePersistedState();
  emitState();
  return buildPublicState();
}

async function setApiPaused(apiId, paused) {
  const target = persistedState.apis.find(api => api.id === apiId);

  if (!target) {
    throw new Error('未找到对应的 API。');
  }

  updateApiRecord(apiId, {
    paused: Boolean(paused),
    status: paused ? 'paused' : target.status === 'paused' ? 'idle' : target.status,
  });

  await savePersistedState();
  addEvent('info', paused ? 'API 已暂停自动巡检。' : 'API 已恢复自动巡检。', target.name);
  emitState();
  return buildPublicState();
}

async function saveApiPayload(payload) {
  const validated = validateApiPayload(payload);
  const timestamp = new Date().toISOString();
  const existingId = trimText(payload?.id);

  if (existingId) {
    updateApiRecord(existingId, validated);
    addEvent('info', 'API 配置已更新。', validated.name);
  } else {
    persistedState.apis = [
      {
        id: randomUUID(),
        ...validated,
        paused: false,
        checkIntervalSeconds: validated.checkIntervalSeconds,
        lastAutoCheckAt: null,
        status: 'idle',
        lastCheckedAt: null,
        lastLatencyMs: null,
        lastMessage: '',
        lastError: '',
        testHistory: [],
        timeoutSeconds: validated.timeoutSeconds,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      ...persistedState.apis,
    ];
    addEvent('info', '已添加新的 API。', validated.name);
  }

  await savePersistedState();
  emitState();
  return buildPublicState();
}

async function deleteApiById(apiId) {
  const target = persistedState.apis.find(api => api.id === apiId);
  persistedState.apis = persistedState.apis.filter(api => api.id !== apiId);
  persistedState.openStatusFloatApiIds = normalizeOpenStatusFloatApiIds(
    persistedState.openStatusFloatApiIds,
    persistedState.apis,
  );
  await savePersistedState();
  addEvent('info', 'API 已删除。', target?.name);
  emitState();
  return buildPublicState();
}

function normalizeImportedApis(apis) {
  if (!Array.isArray(apis)) {
    throw new Error('Gist 配置格式不正确：缺少 apis。');
  }

  return apis.map(rawApi => {
    const decryptedApi = decryptApiSecrets(rawApi);
    const validated = validateApiPayload(decryptedApi);
    const timestamp = new Date().toISOString();

    return {
      id: trimText(rawApi?.id) || randomUUID(),
      ...validated,
      paused: Boolean(rawApi?.paused),
      checkIntervalSeconds: clampInterval(rawApi?.checkIntervalSeconds),
      lastAutoCheckAt: rawApi?.lastAutoCheckAt || null,
      status: 'idle',
      lastCheckedAt: null,
      lastLatencyMs: null,
      lastMessage: '',
      lastError: '',
      testHistory: [],
      createdAt: rawApi?.createdAt || timestamp,
      updatedAt: rawApi?.updatedAt || timestamp,
    };
  });
}

module.exports = {
  appendTestHistory,
  buildSyncExportState,
  clampInterval,
  clampRequestTimeoutSeconds,
  clearAllTestHistory,
  deleteApiById,
  getRequestTimeoutMs,
  loadPersistedState,
  normalizeGistSyncSettings,
  normalizeImportedApis,
  normalizeMonitorMode,
  normalizeOpenStatusFloatApiIds,
  normalizeTestHistory,
  saveApiPayload,
  savePersistedState,
  saveOpenStatusFloatApiIds,
  setApiPaused,
  updateMonitoringSettings,
  updateApiRecord,
  validateApiPayload,
};
