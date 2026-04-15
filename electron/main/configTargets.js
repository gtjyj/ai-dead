const fs = require("fs/promises");
const path = require("path");
const { app } = require("electron");
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

function getCodexHomePath() {
  const codexHome = trimText(process.env.CODEX_HOME);
  return codexHome || path.join(app.getPath("home"), ".codex");
}

function getOpenCodeConfigDirectory() {
  const xdgConfigHome = trimText(process.env.XDG_CONFIG_HOME);

  if (xdgConfigHome) {
    return path.join(xdgConfigHome, "opencode");
  }

  return path.join(app.getPath("home"), ".config", "opencode");
}

async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readTextIfExists(filePath) {
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
  const targetIndex = nextLines.findIndex((line) =>
    line.startsWith(expectedPrefix),
  );
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
  const topLevelLines =
    firstTableIndex >= 0 ? lines.slice(0, firstTableIndex) : lines;
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
  const rebuiltLines = [
    ...updatedTopLevelLines,
    "",
    ...withoutProviderTable,
  ].filter((line, index, allLines) => {
    if (line !== "") {
      return true;
    }

    const previousLine = allLines[index - 1];
    return previousLine !== "";
  });

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

async function applyApiToCodex(apiId) {
  const api = getApiById(apiId);
  const normalizedApi = {
    ...api,
    apiKey: trimText(api.apiKey),
    baseURL: normalizeBaseURL(api.baseURL),
    model: trimText(api.model),
  };
  const codexHomePath = getCodexHomePath();
  const configFilePath = path.join(codexHomePath, "config.toml");
  const authFilePath = path.join(codexHomePath, "auth.json");
  const [rawConfig, rawAuth] = await Promise.all([
    readTextIfExists(configFilePath),
    readTextIfExists(authFilePath),
  ]);
  const updatedConfig = updateCodexConfig(rawConfig, normalizedApi);
  const authConfig = parseJsonOrDefault(
    rawAuth,
    {},
    "Codex auth.json 不是有效的 JSON。",
  );
  const nextAuthConfig = {
    ...authConfig,
    OPENAI_API_KEY: normalizedApi.apiKey,
  };

  await Promise.all([
    ensureParentDirectory(configFilePath),
    ensureParentDirectory(authFilePath),
  ]);
  await Promise.all([
    fs.writeFile(configFilePath, updatedConfig, "utf8"),
    fs.writeFile(
      authFilePath,
      `${JSON.stringify(nextAuthConfig, null, 2)}\n`,
      "utf8",
    ),
  ]);

  return {
    message: `已应用到 Codex CLI：${normalizedApi.name}`,
    paths: {
      auth: authFilePath,
      config: configFilePath,
    },
  };
}

async function applyApiToOpenCode(apiId) {
  const api = getApiById(apiId);
  const normalizedApi = {
    ...api,
    apiKey: trimText(api.apiKey),
    baseURL: normalizeBaseURL(api.baseURL),
    model: trimText(api.model),
    name: trimText(api.name),
    vendor: trimText(api.vendor).toLowerCase() || "openai",
  };
  const configDirectory = getOpenCodeConfigDirectory();
  const configFilePath = path.join(configDirectory, "opencode.json");
  const rawConfig = await readTextIfExists(configFilePath);
  const config = parseJsonOrDefault(
    rawConfig,
    {},
    "OpenCode 配置文件不是有效的 JSON。",
  );
  const providerKey = buildRelayPulseProviderKey(normalizedApi.name);
  const nextConfig = {
    ...config,
    $schema: config.$schema || "https://opencode.ai/config.json",
    model: `${providerKey}/${normalizedApi.model}`,
    provider: {
      ...(config.provider && typeof config.provider === "object"
        ? config.provider
        : {}),
      [providerKey]: buildOpenCodeProvider(normalizedApi, providerKey),
    },
  };

  await ensureParentDirectory(configFilePath);
  await fs.writeFile(
    configFilePath,
    `${JSON.stringify(nextConfig, null, 2)}\n`,
    "utf8",
  );

  return {
    message: `已应用到 OpenCode：${providerKey}/${normalizedApi.model}`,
    paths: {
      config: configFilePath,
    },
    providerKey,
  };
}

async function applyApiToTarget(payload) {
  const target = trimText(payload?.target).toLowerCase();
  const apiId = trimText(payload?.apiId);

  if (!apiId) {
    throw new Error("缺少要应用的 API。");
  }

  if (target === "codex") {
    return applyApiToCodex(apiId);
  }

  if (target === "opencode") {
    return applyApiToOpenCode(apiId);
  }

  throw new Error("不支持的配置目标。");
}

module.exports = {
  applyApiToTarget,
};
