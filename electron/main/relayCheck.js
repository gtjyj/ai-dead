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
const RESPONSES_STREAM_RETRY_COUNT = 3;

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

function parseJsonSafely(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function trimTrailingSlash(text) {
  return String(text || '').replace(/\/+$/, '');
}

function extractStreamingPayloadText(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  if (payload.type === 'response.output_text.done' && typeof payload.text === 'string') {
    return payload.text;
  }

  if (typeof payload.output_text === 'string') {
    return payload.output_text;
  }

  if (Array.isArray(payload.output)) {
    return payload.output
      .flatMap(item => Array.isArray(item?.content) ? item.content : [])
      .filter(part => part?.type === 'output_text' && typeof part.text === 'string')
      .map(part => part.text)
      .join(' ')
      .trim();
  }

  const choice = payload?.choices?.[0];

  if (typeof choice?.message?.content === 'string') {
    return choice.message.content;
  }

  if (typeof choice?.delta?.content === 'string') {
    return choice.delta.content;
  }

  return '';
}

async function readStreamResult(stream) {
  const reader = stream.getReader();
  let buffer = '';
  let finalText = '';
  let sawCompleted = false;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += Buffer.from(value).toString('utf8');

    while (true) {
      const separatorIndex = buffer.indexOf('\n\n');

      if (separatorIndex === -1) {
        break;
      }

      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const dataLines = rawEvent
        .split('\n')
        .filter(line => line.startsWith('data: '))
        .map(line => line.slice(6));

      if (!dataLines.length) {
        continue;
      }

      const payloadText = dataLines.join('\n');

      if (payloadText === '[DONE]') {
        sawCompleted = true;
        continue;
      }

      const payload = parseJsonSafely(payloadText);

      if (!payload) {
        continue;
      }

      if (payload.type === 'response.completed') {
        sawCompleted = true;
      }

      if (payload.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
        finalText += payload.delta;
        continue;
      }

      const snapshotText = extractStreamingPayloadText(payload);

      if (snapshotText) {
        finalText = snapshotText;
      }
    }
  }

  return {
    text: trimText(finalText),
    sawCompleted,
  };
}

async function readResponseText(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('text/event-stream')) {
    if (!response.body) {
      return {
        text: '',
        sawCompleted: false,
      };
    }

    return readStreamResult(response.body);
  }

  const rawText = await response.text().catch(() => '');
  const trimmed = trimText(rawText);

  if (!trimmed) {
    return {
      text: '',
      sawCompleted: false,
    };
  }

  const payload = parseJsonSafely(trimmed);

  if (!payload) {
    return {
      text: trimmed,
      sawCompleted: false,
    };
  }

  return {
    text: trimText(extractStreamingPayloadText(payload)),
    sawCompleted: payload.type === 'response.completed',
  };
}

async function tryResponsesStreamFallback(api, signal) {
  for (let attempt = 1; attempt <= RESPONSES_STREAM_RETRY_COUNT; attempt += 1) {
    const response = await fetch(`${trimTrailingSlash(api.baseURL)}/responses`, {
      method: 'POST',
      signal,
      headers: {
        accept: 'text/event-stream',
        authorization: `Bearer ${api.apiKey}`,
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'x-relay-pulse-check-id': randomUUID(),
      },
      body: JSON.stringify({
        model: api.model,
        store: false,
        stream: true,
        input: 'Return OK only.',
      }),
    });

    if (!response.ok) {
      return {
        text: '',
        method: 'responses / stream',
      };
    }

    const { text, sawCompleted } = await readResponseText(response);

    if (text || sawCompleted || attempt === RESPONSES_STREAM_RETRY_COUNT) {
      return {
        text,
        method: attempt > 1 ? `responses / stream (retry ${attempt})` : 'responses / stream',
      };
    }
  }

  return {
    text: '',
    method: 'responses / stream',
  };
}

function buildSuccessMessage(text, method) {
  const normalizedMethod = method || 'unknown';
  const normalizedText = trimText(text).slice(0, 120);

  if (!normalizedText) {
    return `状态 ok，无响应（响应方式：${normalizedMethod}）`;
  }

  return `${normalizedText}（响应方式：${normalizedMethod}）`;
}

function shouldFallbackToResponses(error) {
  const message = trimText(error?.message).toLowerCase();
  const nestedMessage = trimText(error?.cause?.message).toLowerCase();

  return [message, nestedMessage].some(text => (
    text.includes('unexpected end of json input')
    || text.includes('invalid json response')
    || text.includes('stream closed before response.completed')
  ));
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
    let sdkError = null;
    let responseText = '';
    let responseMethod = 'chat.completions / non-stream';

    try {
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

      responseText = trimText(
        extractResultText(result?.content)
        || result?.text
        || result?.outputText,
      );
    } catch (error) {
      sdkError = error;

      if (!shouldFallbackToResponses(error)) {
        throw error;
      }

      responseMethod = 'chat.completions / non-stream -> responses / stream';
    }

    if (!responseText) {
      const fallback = await tryResponsesStreamFallback(api, controller.signal).catch(() => null);

      if (fallback?.text) {
        responseText = fallback.text;
        responseMethod = fallback.method;
      } else if (fallback?.method) {
        responseMethod = `${responseMethod} -> ${fallback.method}`;
      }
    }

    if (!responseText && sdkError) {
      throw sdkError;
    }

    const detail = buildSuccessMessage(responseText, responseMethod);
    const latency = Date.now() - startedAt;
    const checkedAt = new Date().toISOString();
    updateApiRecord(api.id, {
      status: 'success',
      lastCheckedAt: checkedAt,
      lastAutoCheckAt: checkedAt,
      lastLatencyMs: latency,
      lastMessage: detail,
      lastError: '',
      testHistory: appendTestHistory(api, {
        at: checkedAt,
        latencyMs: latency,
        status: 'success',
        detail,
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
