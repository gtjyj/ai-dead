const { addEvent, buildPublicState, emitState, persistedState } = require('./store');
const {
  buildRemoteMachinesSyncExport,
  buildSyncExportState,
  clampInterval,
  normalizeGistSyncSettings,
  normalizeImportedApis,
  normalizeImportedRemoteMachines,
  normalizeRemoteMachinesSyncSettings,
  savePersistedState,
  saveRemoteMachinesState,
} = require('./data');
const { normalizeBaseURL, trimText } = require('./lib/text');

function formatGitHubGistError(payload, fallbackMessage) {
  const message = trimText(payload?.message);

  if (message === 'Bad credentials') {
    return 'GitHub Token 无效、已失效，或没有 Gist 权限。';
  }

  if (message === 'Not Found') {
    return 'Gist ID 不存在，或当前 Token 无权访问这个 Gist。';
  }

  if (message === 'Resource not accessible by personal access token') {
    return '当前 GitHub Token 没有足够权限访问 Gist。';
  }

  return message || fallbackMessage;
}

function buildGitHubGistHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': 'relay-pulse',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function parseGitHubResponse(response) {
  return response.json().catch(() => ({}));
}

async function updateOrCreateGist(gistSync, body) {
  const headers = buildGitHubGistHeaders(gistSync.token);

  if (gistSync.gistId) {
    const updateResponse = await fetch(`https://api.github.com/gists/${gistSync.gistId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
    const updatePayload = await parseGitHubResponse(updateResponse);

    if (updateResponse.ok) {
      return updatePayload;
    }

    if (updateResponse.status !== 404) {
      throw new Error(formatGitHubGistError(updatePayload, '同步到 GitHub Gist 失败。'));
    }
  }

  const createResponse = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const createPayload = await parseGitHubResponse(createResponse);

  if (!createResponse.ok) {
    throw new Error(formatGitHubGistError(createPayload, '同步到 GitHub Gist 失败。'));
  }

  return createPayload;
}

function normalizeRestoreMode(value) {
  return value === 'merge' ? 'merge' : 'overwrite';
}

function getApiRestoreKey(api) {
  const baseURL = normalizeBaseURL(api?.baseURL).toLowerCase();
  const model = trimText(api?.model).toLowerCase();

  return baseURL && model ? `${baseURL}::${model}` : '';
}

function mergeImportedApis(localApis, importedApis) {
  const remainingLocalApis = [...localApis];

  const mergedImportedApis = importedApis.map(importedApi => {
    const importedId = trimText(importedApi?.id);
    const importedKey = getApiRestoreKey(importedApi);
    const matchedIndex = remainingLocalApis.findIndex(localApi => {
      const localId = trimText(localApi?.id);

      if (importedId && localId && importedId === localId) {
        return true;
      }

      return importedKey && importedKey === getApiRestoreKey(localApi);
    });

    if (matchedIndex >= 0) {
      remainingLocalApis.splice(matchedIndex, 1);
    }

    return importedApi;
  });

  return [...mergedImportedApis, ...remainingLocalApis];
}

function mergeImportedRemoteMachines(localMachines, importedMachines) {
  const remainingLocalMachines = [...localMachines];

  const mergedImportedMachines = importedMachines.map(importedMachine => {
    const importedId = trimText(importedMachine?.id);
    const importedHost = trimText(importedMachine?.host).toLowerCase();
    const importedUsername = trimText(importedMachine?.username).toLowerCase();
    const matchedIndex = remainingLocalMachines.findIndex(localMachine => {
      const localId = trimText(localMachine?.id);
      const localHost = trimText(localMachine?.host).toLowerCase();
      const localUsername = trimText(localMachine?.username).toLowerCase();

      if (importedId && localId && importedId === localId) {
        return true;
      }

      return importedHost && importedUsername
        && importedHost === localHost
        && importedUsername === localUsername;
    });

    if (matchedIndex >= 0) {
      remainingLocalMachines.splice(matchedIndex, 1);
    }

    return importedMachine;
  });

  return [...mergedImportedMachines, ...remainingLocalMachines];
}

async function fetchGistFileContent(file, headers) {
  if (typeof file?.content === 'string' && !file?.truncated) {
    return file.content;
  }

  if (!file?.raw_url) {
    throw new Error('Gist 配置文件内容不可用。');
  }

  const response = await fetch(file.raw_url, { headers });

  if (!response.ok) {
    throw new Error('读取 Gist 配置文件失败。');
  }

  return response.text();
}

async function syncConfigToGist(request) {
  const gistSync = normalizeGistSyncSettings(request?.settings || request);
  const silent = Boolean(request?.silent);
  if (!gistSync.token) {
    throw new Error('请先填写 GitHub Token。');
  }

  const payload = await updateOrCreateGist(gistSync, {
    description: 'Relay Pulse config backup',
    files: {
      'relay-pulse-config.json': {
        content: JSON.stringify(buildSyncExportState(), null, 2),
      },
      'relay-pulse-remote-machines.json': {
        content: JSON.stringify(buildRemoteMachinesSyncExport(), null, 2),
      },
    },
    public: false,
  });

  persistedState.gistSync = {
    token: gistSync.token,
    gistId: payload?.id || gistSync.gistId,
  };
  await savePersistedState();
  if (!silent) {
    addEvent('info', '配置已同步到 GitHub Gist。');
  }
  emitState();

  return {
    gistId: persistedState.gistSync.gistId,
    gistUrl: payload?.html_url || '',
    snapshot: buildPublicState(),
  };
}

async function syncRemoteMachinesToGist(request) {
  const gistSync = normalizeGistSyncSettings(request?.settings || request);
  const remoteMachinesSync = normalizeRemoteMachinesSyncSettings(request?.remoteMachinesSync || request);

  if (!gistSync.token) {
    throw new Error('请先填写 GitHub Token。');
  }

  const payload = await updateOrCreateGist({
    token: gistSync.token,
    gistId: remoteMachinesSync.gistId,
  }, {
    description: 'Relay Pulse remote machines backup',
    files: {
      'relay-pulse-remote-machines.json': {
        content: JSON.stringify(buildRemoteMachinesSyncExport(), null, 2),
      },
    },
    public: false,
  });

  persistedState.remoteMachinesSync = {
    gistId: payload?.id || remoteMachinesSync.gistId,
  };
  await saveRemoteMachinesState();
  addEvent('info', '远程机器已同步到 GitHub Gist。');
  emitState();

  return {
    gistId: persistedState.remoteMachinesSync.gistId,
    gistUrl: payload?.html_url || '',
    snapshot: buildPublicState(),
  };
}

async function restoreConfigFromGist(request) {
  const gistSync = normalizeGistSyncSettings(request?.settings || request);
  const restoreMode = normalizeRestoreMode(request?.mode);
  if (!gistSync.token) {
    throw new Error('请先填写 GitHub Token。');
  }

  if (!gistSync.gistId) {
    throw new Error('当前还没有 Gist ID，请先执行一次“同步到 Gist”。');
  }

  const headers = buildGitHubGistHeaders(gistSync.token);
  delete headers['Content-Type'];
  const response = await fetch(`https://api.github.com/gists/${gistSync.gistId}`, {
    headers,
  });
  const payload = await parseGitHubResponse(response);
  if (!response.ok) {
    throw new Error(formatGitHubGistError(payload, '从 GitHub Gist 读取配置失败。'));
  }

  const files = payload?.files || {};
  const targetFile = files['relay-pulse-config.json']
    || Object.values(files).find(file => String(file?.filename || '').endsWith('.json'));
  if (!targetFile) {
    throw new Error('Gist 中没有找到 relay-pulse-config.json。');
  }

  const rawContent = await fetchGistFileContent(targetFile, headers);
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch (_error) {
    throw new Error('Gist 配置文件不是有效的 JSON。');
  }

  const importedApis = normalizeImportedApis(parsed?.apis);
  const remoteMachinesFile = files['relay-pulse-remote-machines.json'];
  let importedRemoteMachines = [];

  if (remoteMachinesFile) {
    const rawRemoteMachinesContent = await fetchGistFileContent(remoteMachinesFile, headers);

    try {
      const parsedRemoteMachines = JSON.parse(rawRemoteMachinesContent);
      importedRemoteMachines = normalizeImportedRemoteMachines(parsedRemoteMachines?.remoteMachines);
    } catch (_error) {
      throw new Error('Gist 中的远程机器配置文件不是有效的 JSON。');
    }
  }

  persistedState.apis = restoreMode === 'merge'
    ? mergeImportedApis(persistedState.apis, importedApis)
    : importedApis;
  if (remoteMachinesFile) {
    persistedState.remoteMachines = restoreMode === 'merge'
      ? mergeImportedRemoteMachines(persistedState.remoteMachines, importedRemoteMachines)
      : importedRemoteMachines;
  }
  persistedState.intervalSeconds = restoreMode === 'merge'
    ? persistedState.intervalSeconds
    : clampInterval(parsed?.intervalSeconds);
  persistedState.gistSync = gistSync;

  await savePersistedState();
  await saveRemoteMachinesState();
  addEvent(
    'info',
    restoreMode === 'merge'
      ? '已从 GitHub Gist 合并配置。'
      : '已从 GitHub Gist 恢复配置。',
  );
  emitState();

  return {
    gistId: gistSync.gistId,
    gistUrl: payload?.html_url || '',
    mode: restoreMode,
    snapshot: buildPublicState(),
  };
}

async function restoreRemoteMachinesFromGist(request) {
  const gistSync = normalizeGistSyncSettings(request?.settings || request);
  const remoteMachinesSync = normalizeRemoteMachinesSyncSettings(request?.remoteMachinesSync || request);
  const restoreMode = normalizeRestoreMode(request?.mode);

  if (!gistSync.token) {
    throw new Error('请先填写 GitHub Token。');
  }

  if (!remoteMachinesSync.gistId) {
    throw new Error('当前还没有远程机器 Gist ID，请先执行一次“同步到 Gist”。');
  }

  const headers = buildGitHubGistHeaders(gistSync.token);
  delete headers['Content-Type'];
  const response = await fetch(`https://api.github.com/gists/${remoteMachinesSync.gistId}`, {
    headers,
  });
  const payload = await parseGitHubResponse(response);
  if (!response.ok) {
    throw new Error(formatGitHubGistError(payload, '从 GitHub Gist 读取远程机器配置失败。'));
  }

  const files = payload?.files || {};
  const remoteMachinesFile = files['relay-pulse-remote-machines.json']
    || Object.values(files).find(file => String(file?.filename || '').endsWith('.json'));
  if (!remoteMachinesFile) {
    throw new Error('Gist 中没有找到 relay-pulse-remote-machines.json。');
  }

  const rawRemoteMachinesContent = await fetchGistFileContent(remoteMachinesFile, headers);
  let parsedRemoteMachines;
  try {
    parsedRemoteMachines = JSON.parse(rawRemoteMachinesContent);
  } catch (_error) {
    throw new Error('远程机器配置文件不是有效的 JSON。');
  }

  const importedRemoteMachines = normalizeImportedRemoteMachines(parsedRemoteMachines?.remoteMachines);
  persistedState.remoteMachines = restoreMode === 'merge'
    ? mergeImportedRemoteMachines(persistedState.remoteMachines, importedRemoteMachines)
    : importedRemoteMachines;
  persistedState.remoteMachinesSync = remoteMachinesSync;

  await saveRemoteMachinesState();
  addEvent(
    'info',
    restoreMode === 'merge'
      ? '已从 GitHub Gist 合并远程机器配置。'
      : '已从 GitHub Gist 恢复远程机器配置。',
  );
  emitState();

  return {
    gistId: remoteMachinesSync.gistId,
    gistUrl: payload?.html_url || '',
    mode: restoreMode,
    snapshot: buildPublicState(),
  };
}

module.exports = {
  restoreConfigFromGist,
  restoreRemoteMachinesFromGist,
  syncConfigToGist,
  syncRemoteMachinesToGist,
};
