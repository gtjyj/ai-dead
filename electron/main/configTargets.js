const fs = require("fs/promises");
const dns = require("dns");
const net = require("net");
const path = require("path");
const { app } = require("electron");
const { Client } = require("ssh2");
const { persistedState } = require("./store");
const { normalizeBaseURL, trimText } = require("./lib/text");

const CODEX_PROVIDER_KEY = "relaypulse";

function getApiById(apiId) {
  const targetId = trimText(apiId);
  const api = persistedState.apis.find((item) => item.id === targetId);

  if (!api) {
    throw new Error("没有找到要应用的 API 配置。");
  }

  return api;
}

function getRemoteMachineById(machineId) {
  const targetId = trimText(machineId);
  const machine = persistedState.remoteMachines.find((item) => item.id === targetId);

  if (!machine) {
    throw new Error("没有找到要应用的远程机器。");
  }

  return machine;
}

function normalizeApiConfig(apiId) {
  const api = getApiById(apiId);

  return {
    ...api,
    apiKey: trimText(api.apiKey),
    baseURL: normalizeBaseURL(api.baseURL),
    model: trimText(api.model),
    name: trimText(api.name),
    vendor: trimText(api.vendor).toLowerCase() || "openai",
  };
}

function getLocalEnvPaths() {
  return {
    home: app.getPath("home"),
    xdgConfigHome: trimText(process.env.XDG_CONFIG_HOME),
    codexHome: trimText(process.env.CODEX_HOME),
  };
}

function buildLocalPathHelpers(envPaths) {
  return {
    join: (...parts) => path.join(...parts),
    dirname: (filePath) => path.dirname(filePath),
    getCodexHome: () => envPaths.codexHome || path.join(envPaths.home, ".codex"),
    getOpenCodeConfigDirectory: () =>
      envPaths.xdgConfigHome
        ? path.join(envPaths.xdgConfigHome, "opencode")
        : path.join(envPaths.home, ".config", "opencode"),
  };
}

function buildRemotePathHelpers(envPaths) {
  return {
    join: (...parts) => path.posix.join(...parts),
    dirname: (filePath) => path.posix.dirname(filePath),
    getCodexHome: () => trimText(envPaths.codexHome) || path.posix.join(envPaths.home, ".codex"),
    getOpenCodeConfigDirectory: () =>
      trimText(envPaths.xdgConfigHome)
        ? path.posix.join(envPaths.xdgConfigHome, "opencode")
        : path.posix.join(envPaths.home, ".config", "opencode"),
  };
}

async function readLocalTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function escapeTomlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function upsertTomlScalar(lines, key, value) {
  const expectedPrefix = `${key} = `;
  const nextLines = [...lines];
  const targetIndex = nextLines.findIndex((line) => line.startsWith(expectedPrefix));
  const serializedValue = `${key} = "${escapeTomlString(value)}"`;

  if (targetIndex >= 0) {
    nextLines[targetIndex] = serializedValue;
    return nextLines;
  }

  return [serializedValue, ...nextLines];
}

function stripTomlTable(lines, tableName) {
  const output = [];
  let skipping = false;

  for (const line of lines) {
    const tableMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);

    if (tableMatch) {
      const currentTableName = tableMatch[1];

      if (currentTableName === tableName) {
        skipping = true;
        continue;
      }

      skipping = false;
    }

    if (!skipping) {
      output.push(line);
    }
  }

  return output;
}

function buildCodexConfig(api) {
  const configLines = [
    `model_provider = "${CODEX_PROVIDER_KEY}"`,
    `model = "${escapeTomlString(api.model)}"`,
    "",
    `[model_providers.${CODEX_PROVIDER_KEY}]`,
    `name = "${CODEX_PROVIDER_KEY}"`,
    `base_url = "${escapeTomlString(api.baseURL)}"`,
    'wire_api = "responses"',
    "requires_openai_auth = true",
  ];

  return `${configLines.join("\n")}\n`;
}

function updateCodexConfig(rawContent, api) {
  if (!trimText(rawContent)) {
    return buildCodexConfig(api);
  }

  const normalizedContent = rawContent.replace(/\r\n/g, "\n");
  const lines = normalizedContent.split("\n");
  const firstTableIndex = lines.findIndex((line) => /^\s*\[/.test(line));
  const topLevelLines = firstTableIndex >= 0 ? lines.slice(0, firstTableIndex) : lines;
  const tableLines = firstTableIndex >= 0 ? lines.slice(firstTableIndex) : [];
  const preservedTopLevelLines = topLevelLines.filter((line) => {
    const trimmedLine = line.trim();
    return (
      trimmedLine &&
      !trimmedLine.startsWith("model_provider = ") &&
      !trimmedLine.startsWith("model = ")
    );
  });
  const updatedTopLevelLines = upsertTomlScalar(
    upsertTomlScalar(preservedTopLevelLines, "model", api.model),
    "model_provider",
    CODEX_PROVIDER_KEY,
  );
  const withoutProviderTable = stripTomlTable(
    tableLines,
    `model_providers.${CODEX_PROVIDER_KEY}`,
  );
  const rebuiltLines = [...updatedTopLevelLines, "", ...withoutProviderTable].filter(
    (line, index, allLines) => {
      if (line !== "") {
        return true;
      }

      return allLines[index - 1] !== "";
    },
  );

  const trimmedLines = [...rebuiltLines];
  while (trimmedLines.at(-1) === "") {
    trimmedLines.pop();
  }

  trimmedLines.push("");
  trimmedLines.push(`[model_providers.${CODEX_PROVIDER_KEY}]`);
  trimmedLines.push(`name = "${CODEX_PROVIDER_KEY}"`);
  trimmedLines.push(`base_url = "${escapeTomlString(api.baseURL)}"`);
  trimmedLines.push('wire_api = "responses"');
  trimmedLines.push("requires_openai_auth = true");

  return `${trimmedLines.join("\n")}\n`;
}

function parseJsonOrDefault(rawContent, fallbackValue, errorMessage) {
  if (!trimText(rawContent)) {
    return fallbackValue;
  }

  try {
    return JSON.parse(rawContent);
  } catch (_error) {
    throw new Error(errorMessage);
  }
}

function buildRelayPulseProviderKey(name) {
  const normalizedName = trimText(name)
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  const baseName = normalizedName || "provider";

  return baseName.startsWith("rp-") ? baseName : `rp-${baseName}`;
}

function formatModelDisplayName(model) {
  return trimText(model)
    .replace(/^gpt-/i, "GPT-")
    .replace(/-codex$/i, " Codex")
    .replace(/^claude-/i, "Claude-");
}

function buildOpenCodeProvider(api, providerKey) {
  const vendor = trimText(api?.vendor).toLowerCase() || "openai";

  if (vendor === "anthropic") {
    return buildAnthropicOpenCodeProvider(api, providerKey);
  }

  if (vendor === "openai" || vendor === "gemini" || vendor === "other") {
    return buildOpenAiCompatibleOpenCodeProvider(api, providerKey);
  }

  throw new Error(`暂不支持将 ${vendor} 厂商配置写入 OpenCode。`);
}

function buildAnthropicOpenCodeProvider(api, providerKey) {
  return {
    models: {
      [api.model]: {
        name: formatModelDisplayName(api.model) || api.model,
        options: {
          store: false,
        },
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        variants: {
          high: {},
          low: {},
          medium: {},
          xhigh: {},
        },
      },
    },
    name: providerKey,
    npm: "@ai-sdk/anthropic",
    options: {
      apiKey: api.apiKey,
      baseURL: api.baseURL,
    },
  };
}

function buildOpenAiCompatibleOpenCodeProvider(api, providerKey) {
  return {
    models: {
      [api.model]: {
        name: formatModelDisplayName(api.model) || api.model,
        options: {
          store: false,
        },
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        variants: {
          high: {},
          low: {},
          medium: {},
          xhigh: {},
        },
      },
    },
    name: providerKey,
    npm: "@ai-sdk/openai-compatible",
    options: {
      apiKey: api.apiKey,
      baseURL: api.baseURL,
    },
  };
}

function buildOpenCodeConfig(rawContent, api, errorMessage) {
  const config = parseJsonOrDefault(rawContent, {}, errorMessage);
  const providerKey = buildRelayPulseProviderKey(api.name);
  const nextConfig = {
    ...config,
    $schema: config.$schema || "https://opencode.ai/config.json",
    model: `${providerKey}/${api.model}`,
    provider: {
      ...(config.provider && typeof config.provider === "object" ? config.provider : {}),
      [providerKey]: buildOpenCodeProvider(api, providerKey),
    },
  };

  return {
    content: `${JSON.stringify(nextConfig, null, 2)}\n`,
    providerKey,
  };
}

function buildCodexAuthConfig(rawContent, api, errorMessage) {
  const authConfig = parseJsonOrDefault(rawContent, {}, errorMessage);
  const nextAuthConfig = {
    ...authConfig,
    OPENAI_API_KEY: api.apiKey,
  };

  return `${JSON.stringify(nextAuthConfig, null, 2)}\n`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function buildMachineDebugLabel(machine) {
  const name = trimText(machine?.name);
  const username = trimText(machine?.username);
  const host = trimText(machine?.host);
  const port = Number(machine?.port) || 22;
  const identity = username && host ? `${username}@${host}:${port}` : host || "unknown-host";

  return name ? `${name} (${identity})` : identity;
}

function maskSshError(error) {
  return {
    code: error?.code || "",
    level: error?.level || "",
    message: trimText(error?.message),
    name: trimText(error?.name),
  };
}

function logSsh(stage, details) {
  console.log(`[relay-pulse][ssh][${stage}]`, details);
}

async function lookupHostAddresses(hostname) {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, { all: true }, (error, addresses) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(Array.isArray(addresses) ? addresses : []);
    });
  });
}

function createTcpSocket(host, port, label) {
  return new Promise((resolve, reject) => {
    const family = net.isIP(host) || 4;

    logSsh("tcp:start", {
      family,
      host,
      label,
      port,
    });

    const socket = net.connect({ family, host, port });
    let settled = false;

    socket.setTimeout(10000);
    socket.once("connect", () => {
      settled = true;
      logSsh("tcp:connected", {
        host,
        label,
        localAddress: socket.localAddress,
        localPort: socket.localPort,
        port,
        remoteAddress: socket.remoteAddress,
        remoteFamily: socket.remoteFamily,
        remotePort: socket.remotePort,
      });
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once("timeout", () => {
      logSsh("tcp:timeout", { host, label, port });
      socket.destroy();
      reject(new Error("TCP 连接超时。"));
    });
    socket.once("error", (error) => {
      logSsh("tcp:error", {
        error: maskSshError(error),
        host,
        label,
        port,
      });

      if (settled) {
        return;
      }

      reject(error);
    });
    socket.once("close", (hadError) => {
      logSsh("tcp:close", {
        hadError,
        host,
        label,
        port,
      });
    });
  });
}

async function connectSsh(machine) {
  const machineLabel = buildMachineDebugLabel(machine);
  const resolvedAddresses = await lookupHostAddresses(trimText(machine.host)).catch((error) => {
    logSsh("dns:error", {
      error: maskSshError(error),
      host: trimText(machine.host),
      label: machineLabel,
    });
    return [];
  });
  const preferredAddress =
    resolvedAddresses.find((item) => item.family === 4)?.address ||
    resolvedAddresses.find((item) => item.family === 6)?.address ||
    "";

  logSsh("dns:lookup", {
    addresses: resolvedAddresses,
    host: trimText(machine.host),
    preferredAddress,
    label: machineLabel,
  });

  const targetHost = preferredAddress || trimText(machine.host);
  const targetPort = Number(machine.port) || 22;
  const socket = await createTcpSocket(targetHost, targetPort, machineLabel);

  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    const connectionOptions = {
      hostHash: "sha256",
      sock: socket,
      host: targetHost,
      hostname: trimText(machine.host),
      port: targetPort,
      readyTimeout: 30000,
      tryKeyboard: machine.authType !== "key",
      username: trimText(machine.username),
    };

    if (machine.authType === "key") {
      connectionOptions.privateKey = machine.privateKey;
    } else {
      connectionOptions.password = machine.password;
    }

    logSsh("connect:start", {
      authType: machine.authType,
      hasPassword: Boolean(machine.password),
      hasPrivateKey: Boolean(trimText(machine.privateKey)),
      host: connectionOptions.host,
      hostOriginal: trimText(machine.host),
      label: machineLabel,
      port: connectionOptions.port,
      privateKeyLength: typeof machine.privateKey === "string" ? machine.privateKey.length : 0,
      readyTimeout: connectionOptions.readyTimeout,
      tryKeyboard: connectionOptions.tryKeyboard,
      username: connectionOptions.username,
    });

    client.on("ready", () => {
      settled = true;
      logSsh("connect:ready", { label: machineLabel });
      resolve(client);
    });
    client.on("banner", (message) => {
      logSsh("connect:banner", {
        label: machineLabel,
        message: trimText(message),
      });
    });
    client.on("handshake", (negotiated) => {
      logSsh("connect:handshake", {
        label: machineLabel,
        negotiated,
      });
    });
    client.on("hostkeys", (keys) => {
      logSsh("connect:hostkeys", {
        keyCount: Array.isArray(keys) ? keys.length : 0,
        label: machineLabel,
      });
    });
    client.on("keyboard-interactive", (_name, instructions, _lang, prompts, finish) => {
      logSsh("auth:keyboard-interactive", {
        instructions: trimText(instructions),
        label: machineLabel,
        promptCount: Array.isArray(prompts) ? prompts.length : 0,
      });

      if (machine.authType === "key") {
        finish([]);
        return;
      }

      finish(prompts.map(() => machine.password || ""));
    });
    client.on("error", (error) => {
      logSsh("connect:error", {
        error: maskSshError(error),
        label: machineLabel,
      });

      if (settled) {
        return;
      }

      const message = trimText(error?.message);
      if (message.includes("Timed out while waiting for handshake")) {
        socket.destroy();
        reject(new Error("SSH 握手超时，请检查主机地址、端口、网络连通性，或确认目标机器支持当前认证方式。"));
        return;
      }

      socket.destroy();
      reject(error);
    });
    client.on("close", () => {
      logSsh("connect:close", { label: machineLabel });
    });
    client.on("end", () => {
      logSsh("connect:end", { label: machineLabel });
    });
    client.on("ready", () => {
      socket.setTimeout(0);
    });
    client.connect(connectionOptions);
  });
}

function sshExec(client, command) {
  return new Promise((resolve, reject) => {
    logSsh("exec:start", { command });
    client.exec(command, (error, stream) => {
      if (error) {
        logSsh("exec:error", {
          command,
          error: maskSshError(error),
        });
        reject(error);
        return;
      }

      let stdout = "";
      let stderr = "";

      stream.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      stream.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      stream.on("close", (code) => {
        logSsh("exec:close", {
          code,
          command,
          stderr: trimText(stderr),
          stdout: trimText(stdout),
        });
        if (code && code !== 0) {
          reject(new Error(trimText(stderr) || `远程命令执行失败：${command}`));
          return;
        }

        resolve(stdout);
      });
    });
  });
}

function openSftp(client) {
  return new Promise((resolve, reject) => {
    logSsh("sftp:start", {});
    client.sftp((error, sftp) => {
      if (error) {
        logSsh("sftp:error", {
          error: maskSshError(error),
        });
        reject(error);
        return;
      }

      logSsh("sftp:ready", {});
      resolve(sftp);
    });
  });
}

function sftpReadFile(sftp, filePath) {
  return new Promise((resolve, reject) => {
    logSsh("sftp:read:start", { filePath });
    sftp.readFile(filePath, { encoding: "utf8" }, (error, data) => {
      if (error) {
        if (error.code === 2) {
          logSsh("sftp:read:missing", { filePath });
          resolve("");
          return;
        }

        logSsh("sftp:read:error", {
          error: maskSshError(error),
          filePath,
        });
        reject(error);
        return;
      }

      logSsh("sftp:read:ok", {
        filePath,
        size: typeof data === "string" ? data.length : data?.length || 0,
      });
      resolve(typeof data === "string" ? data : data.toString("utf8"));
    });
  });
}

function sftpWriteFile(sftp, filePath, content) {
  return new Promise((resolve, reject) => {
    logSsh("sftp:write:start", {
      filePath,
      size: typeof content === "string" ? content.length : 0,
    });
    sftp.writeFile(filePath, content, { encoding: "utf8" }, (error) => {
      if (error) {
        logSsh("sftp:write:error", {
          error: maskSshError(error),
          filePath,
        });
        reject(error);
        return;
      }

      logSsh("sftp:write:ok", { filePath });
      resolve();
    });
  });
}

async function createLocalSession() {
  const envPaths = getLocalEnvPaths();
  const pathHelpers = buildLocalPathHelpers(envPaths);

  return {
    envPaths,
    path: pathHelpers,
    close: async () => {},
    ensureParentDirectory: async (filePath) => {
      await fs.mkdir(pathHelpers.dirname(filePath), { recursive: true });
    },
    readTextIfExists: async (filePath) => readLocalTextIfExists(filePath),
    writeText: async (filePath, content) => {
      await fs.writeFile(filePath, content, "utf8");
    },
  };
}

async function createRemoteSession(machine) {
  const machineLabel = buildMachineDebugLabel(machine);
  logSsh("session:create:start", { label: machineLabel });
  const client = await connectSsh(machine);
  const sftp = await openSftp(client);

  try {
    logSsh("session:env:start", { label: machineLabel });
    const raw = await sshExec(
      client,
      "printf '%s\\n%s\\n%s' \"$HOME\" \"$XDG_CONFIG_HOME\" \"$CODEX_HOME\"",
    );
    const [home = "", xdgConfigHome = "", codexHome = ""] = raw.replace(/\r/g, "").split("\n");

    if (!trimText(home)) {
      throw new Error("无法读取远程机器 HOME 环境变量。");
    }

    const envPaths = {
      home: trimText(home),
      xdgConfigHome: trimText(xdgConfigHome),
      codexHome: trimText(codexHome),
    };
    logSsh("session:env:ok", {
      envPaths,
      label: machineLabel,
    });
    const pathHelpers = buildRemotePathHelpers(envPaths);

    return {
      envPaths,
      path: pathHelpers,
      close: async () => {
        logSsh("session:close", { label: machineLabel });
        try {
          sftp.end?.();
        } finally {
          client.end();
        }
      },
      ensureParentDirectory: async (filePath) => {
        logSsh("mkdir:start", {
          dirPath: pathHelpers.dirname(filePath),
          label: machineLabel,
        });
        await sshExec(client, `mkdir -p ${shellQuote(pathHelpers.dirname(filePath))}`);
        logSsh("mkdir:ok", {
          dirPath: pathHelpers.dirname(filePath),
          label: machineLabel,
        });
      },
      readTextIfExists: async (filePath) => sftpReadFile(sftp, filePath),
      writeText: async (filePath, content) => {
        await sftpWriteFile(sftp, filePath, content);
      },
    };
  } catch (error) {
    logSsh("session:create:error", {
      error: maskSshError(error),
      label: machineLabel,
    });
    try {
      sftp.end?.();
    } finally {
      client.end();
    }
    throw error;
  }
}

async function withTargetSession(target, handler) {
  logSsh("target:session:start", {
    machineId: target.machineId,
    scope: target.scope,
    tool: target.tool,
  });
  const session =
    target.scope === "remote"
      ? await createRemoteSession(getRemoteMachineById(target.machineId))
      : await createLocalSession();

  try {
    return await handler(session);
  } finally {
    logSsh("target:session:close", {
      machineId: target.machineId,
      scope: target.scope,
      tool: target.tool,
    });
    await session.close();
  }
}

function getTargetMachineName(target) {
  if (target.scope !== "remote") {
    return "本机";
  }

  const machine = getRemoteMachineById(target.machineId);
  return trimText(machine.name) || trimText(machine.host);
}

function resolveCodexFiles(session) {
  const codexHomePath = session.path.getCodexHome();

  return {
    configFilePath: session.path.join(codexHomePath, "config.toml"),
    authFilePath: session.path.join(codexHomePath, "auth.json"),
  };
}

function resolveOpenCodeFile(session) {
  const configDirectory = session.path.getOpenCodeConfigDirectory();

  return {
    configFilePath: session.path.join(configDirectory, "opencode.json"),
  };
}

async function writeCodexConfig(session, api, target) {
  const { configFilePath, authFilePath } = resolveCodexFiles(session);
  logSsh("codex:paths", {
    authFilePath,
    configFilePath,
    scope: target.scope,
  });
  const [rawConfig, rawAuth] = await Promise.all([
    session.readTextIfExists(configFilePath),
    session.readTextIfExists(authFilePath),
  ]);
  const updatedConfig = updateCodexConfig(rawConfig, api);
  const updatedAuth = buildCodexAuthConfig(
    rawAuth,
    api,
    target.scope === "remote"
      ? "远程 Codex auth.json 不是有效的 JSON。"
      : "Codex auth.json 不是有效的 JSON。",
  );

  await Promise.all([
    session.ensureParentDirectory(configFilePath),
    session.ensureParentDirectory(authFilePath),
  ]);
  await Promise.all([
    session.writeText(configFilePath, updatedConfig),
    session.writeText(authFilePath, updatedAuth),
  ]);

  return {
    authFilePath,
    configFilePath,
  };
}

async function writeOpenCodeConfig(session, api, target) {
  const { configFilePath } = resolveOpenCodeFile(session);
  logSsh("opencode:paths", {
    configFilePath,
    scope: target.scope,
  });
  const rawConfig = await session.readTextIfExists(configFilePath);
  const result = buildOpenCodeConfig(
    rawConfig,
    api,
    target.scope === "remote"
      ? "远程 OpenCode 配置文件不是有效的 JSON。"
      : "OpenCode 配置文件不是有效的 JSON。",
  );

  await session.ensureParentDirectory(configFilePath);
  await session.writeText(configFilePath, result.content);

  return {
    configFilePath,
    providerKey: result.providerKey,
  };
}

async function applyApiToTool(apiId, target) {
  const api = normalizeApiConfig(apiId);
  const machineName = getTargetMachineName(target);
  logSsh("apply:start", {
    apiId,
    apiName: api.name,
    machineName,
    scope: target.scope,
    tool: target.tool,
  });

  return withTargetSession(target, async (session) => {
    if (target.tool === "codex") {
      const paths = await writeCodexConfig(session, api, target);

      return {
        message:
          target.scope === "remote"
            ? `已通过 SSH 应用到远程 Codex CLI：${machineName}`
            : `已应用到 Codex CLI：${api.name}`,
        paths: {
          auth: paths.authFilePath,
          config: paths.configFilePath,
        },
      };
    }

    if (target.tool === "opencode") {
      const result = await writeOpenCodeConfig(session, api, target);

      return {
        message:
          target.scope === "remote"
            ? `已通过 SSH 应用到远程 OpenCode：${machineName}`
            : `已应用到 OpenCode：${result.providerKey}/${api.model}`,
        paths: {
          config: result.configFilePath,
        },
        providerKey: result.providerKey,
      };
    }

    throw new Error("不支持的配置目标。");
  });
}

function normalizeApplyTarget(target) {
  if (typeof target === "string") {
    return {
      machineId: "",
      scope: "local",
      tool: trimText(target).toLowerCase(),
    };
  }

  return {
    machineId: trimText(target?.machineId),
    scope: trimText(target?.scope).toLowerCase() || "local",
    tool: trimText(target?.tool).toLowerCase(),
  };
}

async function applyApiToTarget(payload) {
  const apiId = trimText(payload?.apiId);
  const target = normalizeApplyTarget(payload?.target);

  if (!apiId) {
    throw new Error("缺少要应用的 API。");
  }

  if (target.scope === "remote" && !target.machineId) {
    throw new Error("缺少远程机器信息。");
  }

  return applyApiToTool(apiId, target);
}

module.exports = {
  applyApiToTarget,
};
