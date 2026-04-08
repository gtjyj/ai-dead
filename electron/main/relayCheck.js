const { randomUUID } = require('crypto');
const { DEFAULT_REQUEST_TIMEOUT_SECONDS } = require('./constants');
const { parseErrorMessage } = require('./lib/errors');
const { createProviderFetch } = require('./lib/providerFetch');
const { trimText } = require('./lib/text');
const { addEvent, buildPublicState, emitState, persistedState, runtimeState } = require('./store');
const {
  appendTestHistory,
  clampInterval,
  getRequestTimeoutMs,
  savePersistedState,
  updateApiRecord,
} = require('./data');

let providerSdkPromise = null;

function extractResultText(content) {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join(' ')
    .trim();
}

async function getProviderSdk() {
  if (!providerSdkPromise) {
    providerSdkPromise = Promise.resolve()
      .then(() => require('@ai-sdk/openai-compatible'))
      .then(compatibleProvider => ({
        createOpenAICompatible: compatibleProvider.createOpenAICompatible,
      }));
  }

  return providerSdkPromise;
}

async function runSingleCheck(api) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const requestTimeoutMs = getRequestTimeoutMs(api);
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  updateApiRecord(api.id, {
    status: 'testing',
    lastError: '',
    lastMessage: 'Checking relay...',
  });
  emitState();

  try {
    const { createOpenAICompatible } = await getProviderSdk();
    const providerName = `relay${api.id.replace(/-/g, '')}`;
    const provider = createOpenAICompatible({
      name: providerName,
      apiKey: api.apiKey,
      baseURL: api.baseURL,
      fetch: createProviderFetch(api.model),
    });
    const model = provider.chatModel(api.model);
    const result = await model.doGenerate({
      prompt: [
        {
          role: 'system',
          content: [{ type: 'text', text: 'This is an isolated health check. Do not use or assume any previous context. Reply with OK only.' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Return OK only.' }],
        },
      ],
      temperature: 0,
      maxOutputTokens: 12,
      abortSignal: controller.signal,
      headers: {
        'cache-control': 'no-cache',
        'x-relay-pulse-check-id': randomUUID(),
      },
      providerOptions: {
        [providerName]: {
          store: false,
        },
      },
    });

    const text = trimText(extractResultText(result?.content)).slice(0, 120) || 'OK';
    const latency = Date.now() - startedAt;
    const checkedAt = new Date().toISOString();
    updateApiRecord(api.id, {
      status: 'success',
      lastCheckedAt: checkedAt,
      lastAutoCheckAt: checkedAt,
      lastLatencyMs: latency,
      lastMessage: text,
      lastError: '',
      testHistory: appendTestHistory(api, {
        at: checkedAt,
        latencyMs: latency,
        status: 'success',
        detail: text,
      }),
    });
    addEvent('success', `连接成功，耗时 ${latency}ms`, api.name);
  } catch (error) {
    const latency = Date.now() - startedAt;
    const message = parseErrorMessage(error, requestTimeoutMs);
    const checkedAt = new Date().toISOString();
    updateApiRecord(api.id, {
      status: 'error',
      lastCheckedAt: checkedAt,
      lastAutoCheckAt: checkedAt,
      lastLatencyMs: latency,
      lastMessage: '',
      lastError: message,
      testHistory: appendTestHistory(api, {
        at: checkedAt,
        latencyMs: latency,
        status: 'error',
        detail: message,
      }),
    });
    addEvent('error', message, api.name);
  } finally {
    clearTimeout(timeout);
    await savePersistedState();
    emitState();
  }
}

function shouldSkipAutoCheck(api) {
  return Boolean(api?.paused);
}

async function runApiChecks(targets, reasonLabel) {
  if (!targets.length) {
    addEvent('info', '当前没有可测试的 API。');
    emitState();
    return buildPublicState();
  }

  addEvent('info', reasonLabel);

  runtimeState.runInFlight = Promise.allSettled(targets.map(runSingleCheck)).finally(() => {
    runtimeState.runInFlight = null;
    emitState();
  });

  await runtimeState.runInFlight;
  return buildPublicState();
}

async function runAllChecks(reason = 'manual') {
  if (runtimeState.runInFlight) {
    return runtimeState.runInFlight;
  }

  runtimeState.lastRunAt = new Date().toISOString();
  const isAutomatic = reason === 'interval' || reason === 'start' || reason === 'per-api';
  const targets = [...persistedState.apis].filter(api => !(isAutomatic && shouldSkipAutoCheck(api)));

  return runApiChecks(
    targets,
    reason === 'interval'
      ? '开始周期巡检。'
      : reason === 'per-api'
        ? '开始按接口间隔巡检。'
        : '开始手动巡检。',
  );
}

async function runSingleCheckById(apiId) {
  const target = persistedState.apis.find(api => api.id === apiId);

  if (!target) {
    throw new Error('未找到对应的 API。');
  }

  runtimeState.lastRunAt = new Date().toISOString();
  addEvent('info', '开始单个巡检。', target.name);
  await runSingleCheck(target);
  return buildPublicState();
}

async function runDueApiChecks() {
  if (runtimeState.runInFlight) {
    return runtimeState.runInFlight;
  }

  const now = Date.now();
  const targets = persistedState.apis.filter(api => {
    if (shouldSkipAutoCheck(api)) {
      return false;
    }

    const intervalMs = clampInterval(api.checkIntervalSeconds) * 1000;
    const lastTriggeredAt = Date.parse(api.lastAutoCheckAt || api.lastCheckedAt || 0);
    return !Number.isFinite(lastTriggeredAt) || now - lastTriggeredAt >= intervalMs;
  });

  if (!targets.length) {
    return buildPublicState();
  }

  const triggeredAt = new Date().toISOString();
  runtimeState.lastRunAt = triggeredAt;
  targets.forEach(api => {
    updateApiRecord(api.id, { lastAutoCheckAt: triggeredAt });
  });
  await savePersistedState();
  emitState();

  return runApiChecks(targets, '开始按接口间隔巡检。');
}

function stopMonitoring() {
  if (runtimeState.intervalHandle) {
    clearInterval(runtimeState.intervalHandle);
    runtimeState.intervalHandle = null;
  }

  if (runtimeState.isRunning) {
    runtimeState.isRunning = false;
    addEvent('info', '已停止巡检。');
  }

  emitState();
}

function scheduleMonitoringLoop() {
  if (runtimeState.intervalHandle) {
    clearInterval(runtimeState.intervalHandle);
  }

  runtimeState.intervalHandle = setInterval(() => {
    if (persistedState.monitorMode === 'per-api') {
      void runDueApiChecks();
      return;
    }

    void runAllChecks('interval');
  }, persistedState.monitorMode === 'per-api' ? 1000 : persistedState.intervalSeconds * 1000);
}

async function refreshMonitoringSchedule() {
  if (!runtimeState.isRunning) {
    return buildPublicState();
  }

  scheduleMonitoringLoop();
  emitState();
  return buildPublicState();
}

async function startMonitoring(settings) {
  persistedState.intervalSeconds = clampInterval(settings?.intervalSeconds);
  persistedState.monitorMode = settings?.monitorMode === 'per-api' ? 'per-api' : 'fixed';
  runtimeState.isRunning = true;

  scheduleMonitoringLoop();

  await savePersistedState();
  addEvent(
    'info',
    persistedState.monitorMode === 'per-api'
      ? '已开始巡检，按各 API 的独立间隔执行。'
      : `已开始巡检，间隔 ${persistedState.intervalSeconds} 秒。`,
  );
  emitState();
  await runAllChecks('start');
  return buildPublicState();
}

module.exports = {
  refreshMonitoringSchedule,
  runAllChecks,
  runSingleCheckById,
  startMonitoring,
  stopMonitoring,
};
