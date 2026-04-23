import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_MONITOR_MODE,
  emptyForm,
  emptyGistSync,
  emptyRemoteMachineForm,
  emptyRemoteMachinesSync,
} from "../lib/monitorDefaults";
import { getModelLabel, normalizeClipboardText } from "../lib/monitorFormatters";
import {
  getAvailabilityRate,
  isApiAvailable,
  isApiHealthy,
} from "../lib/monitorMetrics";

function applySnapshot(snapshot, setters, options = {}) {
  const { includeGistSync = false } = options;

  setters.setApis(snapshot?.apis || []);
  setters.setEvents(snapshot?.events || []);
  setters.setRemoteMachines(snapshot?.remoteMachines || []);
  setters.setRemoteMachinesSync(snapshot?.remoteMachinesSync || emptyRemoteMachinesSync);
  if (includeGistSync) {
    setters.setGistSync(snapshot?.gistSync || emptyGistSync);
  }
  setters.setIntervalSeconds(String(snapshot?.intervalSeconds || 60));
  setters.setMonitorMode(snapshot?.monitorMode || DEFAULT_MONITOR_MODE);
  setters.setNetworkCheckURL(snapshot?.networkCheckURL || "https://baidu.com");
  setters.setNetworkStatus(snapshot?.networkStatus || {
    checkedAt: null,
    checking: false,
    isOnline: true,
    lastError: "",
  });
  setters.setIsRunning(Boolean(snapshot?.isRunning));
  setters.setLastRunAt(snapshot?.lastRunAt || null);
  setters.setStatusFloat(snapshot?.statusFloat || {
    openApiIds: [],
  });
}

const EMPTY_NETWORK_STATUS = {
  checkedAt: null,
  checking: false,
  isOnline: true,
  lastError: "",
};

function getActionErrorMessage(error, fallbackMessage) {
  const message = typeof error?.message === "string" ? error.message : "";
  const match = message.match(/Error:\s(.+)$/);

  return match?.[1] || message || fallbackMessage;
}

function isValidApiName(value) {
  return /^[A-Za-z0-9 _.-]+$/.test(String(value || "").trim());
}

export default function useMonitorApp() {
  const [form, setForm] = useState(emptyForm);
  const [apis, setApis] = useState([]);
  const [events, setEvents] = useState([]);
  const [gistSync, setGistSync] = useState(emptyGistSync);
  const [remoteMachines, setRemoteMachines] = useState([]);
  const [remoteMachinesSync, setRemoteMachinesSync] = useState(emptyRemoteMachinesSync);
  const [intervalSeconds, setIntervalSeconds] = useState("60");
  const [monitorMode, setMonitorMode] = useState(DEFAULT_MONITOR_MODE);
  const [networkCheckURL, setNetworkCheckURL] = useState("https://baidu.com");
  const [networkStatus, setNetworkStatus] = useState(EMPTY_NETWORK_STATUS);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState(null);
  const [formBusy, setFormBusy] = useState(false);
  const [monitorBusy, setMonitorBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [pendingDeleteApi, setPendingDeleteApi] = useState(null);
  const [pendingRestoreChoice, setPendingRestoreChoice] = useState(null);
  const [flash, setFlash] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedModels, setSelectedModels] = useState([]);
  const [isApiFormOpen, setIsApiFormOpen] = useState(false);
  const [isGistSyncOpen, setIsGistSyncOpen] = useState(false);
  const [isRemoteMachinesOpen, setIsRemoteMachinesOpen] = useState(false);
  const [remoteMachineForm, setRemoteMachineForm] = useState(emptyRemoteMachineForm);
  const [statusFloat, setStatusFloat] = useState({ openApiIds: [] });
  const previousModelNamesRef = useRef([]);

  function notify(message, tone = "info") {
    setFlash({ message, tone });
  }

  function hasConfiguredGistSync(settings = gistSync) {
    return Boolean(String(settings?.token || "").trim() && String(settings?.gistId || "").trim());
  }

  useEffect(() => {
    let dispose = () => {};

    async function bootstrap() {
      const snapshot = await window.monitorApi.getBootstrap();
      applySnapshot(snapshot, {
        setApis,
        setEvents,
        setGistSync,
        setRemoteMachines,
        setRemoteMachinesSync,
        setIntervalSeconds,
        setMonitorMode,
        setNetworkCheckURL,
        setNetworkStatus,
        setIsRunning,
        setLastRunAt,
        setStatusFloat,
      }, { includeGistSync: true });

      dispose = window.monitorApi.onStateChange((nextSnapshot) => {
        applySnapshot(nextSnapshot, {
          setApis,
          setEvents,
          setGistSync,
          setRemoteMachines,
          setRemoteMachinesSync,
          setIntervalSeconds,
          setMonitorMode,
          setNetworkCheckURL,
          setNetworkStatus,
          setIsRunning,
          setLastRunAt,
          setStatusFloat,
        });
      });
    }

    bootstrap().catch((error) => {
      notify(getActionErrorMessage(error, "应用状态加载失败。"), "error");
    });

    return () => dispose();
  }, []);

  useEffect(() => {
    if (!flash?.message) {
      return undefined;
    }

    if (flash.tone === "loading") {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setFlash(null);
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    return apis.reduce(
      (accumulator, api) => {
        accumulator.total += 1;

        if (isApiHealthy(api)) {
          accumulator.success += 1;
        } else {
          accumulator.error += 1;
        }

        return accumulator;
      },
      { total: 0, success: 0, error: 0 },
    );
  }, [apis]);

  const sortedApis = useMemo(() => {
    return apis
      .map((api, index) => ({
        api,
        index,
        availabilityRate: getAvailabilityRate((api.testHistory || []).slice(-24)),
      }))
      .sort((left, right) => {
        if (right.availabilityRate !== left.availabilityRate) {
          return right.availabilityRate - left.availabilityRate;
        }

        return left.index - right.index;
      })
      .map((item) => item.api);
  }, [apis]);

  const modelFilters = useMemo(() => {
    const filters = new Map();

    sortedApis.forEach((api) => {
      const label = getModelLabel(api.model);
      const current = filters.get(label) || {
        label,
        total: 0,
        available: 0,
      };

      current.total += 1;
      if (isApiAvailable(api)) {
        current.available += 1;
      }

      filters.set(label, current);
    });

    return Array.from(filters.values());
  }, [sortedApis]);

  useEffect(() => {
    const modelNames = modelFilters.map((item) => item.label);

    setSelectedModels((current) => {
      const currentSet = new Set(current);
      const previousSet = new Set(previousModelNamesRef.current);

      return modelNames.filter(
        (label) => currentSet.has(label) || !previousSet.has(label),
      );
    });

    previousModelNamesRef.current = modelNames;
  }, [modelFilters]);

  const selectedModelSet = useMemo(
    () => new Set(selectedModels),
    [selectedModels],
  );

  const focusedApis = useMemo(
    () =>
      sortedApis.filter((api) => selectedModelSet.has(getModelLabel(api.model))),
    [selectedModelSet, sortedApis],
  );

  const unfocusedApis = useMemo(
    () =>
      sortedApis.filter((api) => !selectedModelSet.has(getModelLabel(api.model))),
    [selectedModelSet, sortedApis],
  );

  function handleToggleModel(model) {
    setSelectedModels((current) => {
      if (current.includes(model)) {
        return current.filter((item) => item !== model);
      }

      return [...current, model];
    });
  }

  async function runAction(setLoading, action, successText) {
    setLoading(true);

    try {
      const snapshot = await action();
      if (snapshot) {
        applySnapshot(snapshot, {
          setApis,
          setEvents,
          setGistSync,
          setRemoteMachines,
          setRemoteMachinesSync,
          setIntervalSeconds,
          setMonitorMode,
          setNetworkCheckURL,
          setNetworkStatus,
          setIsRunning,
          setLastRunAt,
          setStatusFloat,
        });
      }

      notify(successText, "info");
    } catch (error) {
      notify(getActionErrorMessage(error, "操作失败。"), "error");
    } finally {
      setLoading(false);
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateGistSync(field, value) {
    setGistSync((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateRemoteMachinesSync(field, value) {
    setRemoteMachinesSync((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateRemoteMachineForm(field, value) {
    setRemoteMachineForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleEdit(api) {
    setForm({
      id: api.id,
      name: api.name,
      vendor: api.vendor || "openai",
      baseURL: api.baseURL,
      websiteURL: api.websiteURL || "",
      accountName: api.accountName || "",
      accountPassword: api.accountPassword || "",
      apiKey: api.apiKey,
      model: api.model,
      checkIntervalSeconds: String(api.checkIntervalSeconds || 60),
      timeoutSeconds: String(api.timeoutSeconds || 30),
    });
    setIsApiFormOpen(true);
    notify(`正在编辑 ${api.name}`);
  }

  function handleOpenAddApi() {
    setForm(emptyForm);
    setIsApiFormOpen(true);
  }

  function handleOpenGistSync() {
    setIsGistSyncOpen(true);
  }

  function handleOpenRemoteMachines() {
    setRemoteMachineForm(emptyRemoteMachineForm);
    setIsRemoteMachinesOpen(true);
  }

  function handleCloseGistSync() {
    setIsGistSyncOpen(false);
  }

  function handleCloseRemoteMachines() {
    setRemoteMachineForm(emptyRemoteMachineForm);
    setIsRemoteMachinesOpen(false);
  }

  function handleCancelEdit() {
    setForm(emptyForm);
    setIsApiFormOpen(false);
    notify("已取消编辑。");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isValidApiName(form.name)) {
      notify("名称仅支持英文字符、数字、空格、点、下划线和短横线。", "error");
      return;
    }

    const actionText = form.id ? "API 已更新。" : "API 已保存。";
    setFormBusy(true);

    try {
      const snapshot = await window.monitorApi.saveApi(form);
      if (snapshot) {
        applySnapshot(snapshot, {
          setApis,
          setEvents,
          setGistSync,
          setRemoteMachines,
          setRemoteMachinesSync,
          setIntervalSeconds,
          setMonitorMode,
          setNetworkCheckURL,
          setNetworkStatus,
          setIsRunning,
          setLastRunAt,
          setStatusFloat,
        });
      }

      notify(actionText, "info");
      setForm(emptyForm);
      setIsApiFormOpen(false);
    } catch (error) {
      notify(getActionErrorMessage(error, "操作失败。"), "error");
    } finally {
      setFormBusy(false);
    }
  }

  function handleDeleteRequest(api) {
    setPendingDeleteApi(api);
  }

  function handleEditRemoteMachine(machine) {
    setRemoteMachineForm({
      id: machine.id,
      name: machine.name || "",
      host: machine.host || "",
      username: machine.username || "",
      port: String(machine.port || 22),
      authType: machine.authType || "password",
      password: machine.password || "",
      privateKey: machine.privateKey || "",
    });
    setIsRemoteMachinesOpen(true);
    notify(`正在编辑远程机器 ${machine.name || machine.host}`);
  }

  async function handleSubmitRemoteMachine(event) {
    event.preventDefault();
    setListBusy(true);

    try {
      const snapshot = await window.monitorApi.saveRemoteMachine(remoteMachineForm);
      if (snapshot) {
        applySnapshot(snapshot, {
          setApis,
          setEvents,
          setGistSync,
          setRemoteMachines,
          setRemoteMachinesSync,
          setIntervalSeconds,
          setMonitorMode,
          setNetworkCheckURL,
          setNetworkStatus,
          setIsRunning,
          setLastRunAt,
          setStatusFloat,
        });
      }

      notify(remoteMachineForm.id ? "远程机器已更新。" : "远程机器已保存。", "info");
      setRemoteMachineForm(emptyRemoteMachineForm);
    } catch (error) {
      notify(getActionErrorMessage(error, "保存远程机器失败。"), "error");
    } finally {
      setListBusy(false);
    }
  }

  async function handleDeleteRemoteMachine(machine) {
    setListBusy(true);

    try {
      const snapshot = await window.monitorApi.deleteRemoteMachine(machine.id);
      if (snapshot) {
        applySnapshot(snapshot, {
          setApis,
          setEvents,
          setGistSync,
          setRemoteMachines,
          setRemoteMachinesSync,
          setIntervalSeconds,
          setMonitorMode,
          setNetworkCheckURL,
          setNetworkStatus,
          setIsRunning,
          setLastRunAt,
          setStatusFloat,
        });
      }

      if (remoteMachineForm.id === machine.id) {
        setRemoteMachineForm(emptyRemoteMachineForm);
      }
      notify("远程机器已删除。", "info");
    } catch (error) {
      notify(getActionErrorMessage(error, "删除远程机器失败。"), "error");
    } finally {
      setListBusy(false);
    }
  }

  function handleDeleteCancel() {
    if (listBusy) {
      return;
    }

    setPendingDeleteApi(null);
  }

  async function handleDeleteConfirm() {
    if (!pendingDeleteApi) {
      return;
    }

    const target = pendingDeleteApi;
    await runAction(
      setListBusy,
      () => window.monitorApi.deleteApi(target.id),
      "API 已删除。",
    );
    setPendingDeleteApi(null);
  }

  async function handleStart() {
    await runAction(
      setMonitorBusy,
      () => window.monitorApi.start({ intervalSeconds, monitorMode }),
      "巡检已启动。",
    );
  }

  async function handleTogglePause(api) {
    await runAction(
      setListBusy,
      () =>
        window.monitorApi.setApiPaused({
          apiId: api.id,
          paused: !api.paused,
        }),
      api.paused ? `${api.name} 已恢复自动巡检。` : `${api.name} 已暂停自动巡检。`,
    );
  }

  async function handleMonitorModeChange(mode) {
    if (isRunning || monitorBusy) {
      notify("自动巡检运行中时不能切换巡检模式。", "error");
      return;
    }

    const previousMode = monitorMode;
    setMonitorMode(mode);

    try {
      const snapshot = await window.monitorApi.updateSettings({
        intervalSeconds,
        monitorMode: mode,
        networkCheckURL,
      });
      applySnapshot(snapshot, {
        setApis,
        setEvents,
        setGistSync,
        setRemoteMachines,
        setRemoteMachinesSync,
        setIntervalSeconds,
        setMonitorMode,
        setNetworkCheckURL,
        setNetworkStatus,
        setIsRunning,
        setLastRunAt,
        setStatusFloat,
      });

      notify("巡检模式已更新。", "info");
    } catch (error) {
      setMonitorMode(previousMode);
      notify(getActionErrorMessage(error, "更新巡检模式失败。"), "error");
    }
  }

  async function handleStop() {
    await runAction(
      setMonitorBusy,
      () => window.monitorApi.stop(),
      "巡检已停止。",
    );
  }

  async function handleManualCheck() {
    await runAction(
      setMonitorBusy,
      () => window.monitorApi.testNow(),
      "已触发一次手动巡检。",
    );
  }

  async function handleToggleMonitoring() {
    if (isRunning) {
      await handleStop();
      return;
    }

    await handleStart();
  }

  async function handleSingleCheck(api) {
    await runAction(
      setListBusy,
      () => window.monitorApi.testApi(api.id),
      `${api.name} 已完成单独巡检。`,
    );
  }

  async function handleClearHistory() {
    await runAction(
      setListBusy,
      () => window.monitorApi.clearHistory(),
      "历史测试结果已清空。",
    );
  }

  async function handleClearApiHistory(api) {
    await runAction(
      setListBusy,
      () => window.monitorApi.clearApiHistory(api.id),
      `${api.name} 的历史测试结果已清空。`,
    );
  }

  async function handleCopyValue(event, value, successMessage, emptyMessage) {
    event.stopPropagation();

    const text = normalizeClipboardText(value);
    if (!text) {
      notify(emptyMessage);
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        window.monitorApi.copyText(text);
      }

      notify(successMessage);
    } catch (_error) {
      try {
        window.monitorApi.copyText(text);
        notify(successMessage);
      } catch (_fallbackError) {
        notify("复制失败。", "error");
      }
    }
  }

  async function handleCopyApiKey(event, api) {
    await handleCopyValue(
      event,
      api?.apiKey,
      `${api.name} 的 API 密钥已复制。`,
      "没有可复制的 API 密钥。",
    );
  }

  async function handleCopyAccountName(event, api) {
    await handleCopyValue(
      event,
      api?.accountName,
      `${api.name} 的账号已复制。`,
      "没有可复制的账号。",
    );
  }

  async function handleCopyAccountPassword(event, api) {
    await handleCopyValue(
      event,
      api?.accountPassword,
      `${api.name} 的密码已复制。`,
      "没有可复制的密码。",
    );
  }

  async function handleCopyGistId(event, target = gistSync) {
    if (event?.stopPropagation) {
      event.stopPropagation();
    }

    const text = normalizeClipboardText(target?.gistId);
    if (!text) {
      notify("当前还没有可复制的 Gist ID。", "error");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        window.monitorApi.copyText(text);
      }

      notify("Gist ID 已复制。", "info");
    } catch (_error) {
      try {
        window.monitorApi.copyText(text);
        notify("Gist ID 已复制。", "info");
      } catch (_fallbackError) {
        notify("复制 Gist ID 失败。", "error");
      }
    }
  }

  async function handleOpenWebsite(event, api) {
    event.stopPropagation();

    if (!api?.websiteURL) {
      return;
    }

    try {
      await window.monitorApi.openExternal(api.websiteURL);
    } catch (error) {
      notify(getActionErrorMessage(error, "打开官网地址失败。"), "error");
    }
  }

  async function handleApplyApiConfig(api, target) {
    if (typeof window.monitorApi?.applyApiConfig !== "function") {
      notify("当前窗口还没加载新的桌面桥接，请重启应用后再试。", "error");
      return;
    }

    const targetScope = typeof target === "string" ? "local" : String(target?.scope || "local");
    const isRemoteTarget = targetScope === "remote";

    if (isRemoteTarget) {
      notify("正在应用到远程机器，请稍候...", "loading");
    }

    setListBusy(true);

    try {
      const result = await window.monitorApi.applyApiConfig({
        apiId: api?.id,
        target,
      });
      notify(result?.message || `${api?.name || 'API'} 已写入配置。`, 'info');
    } catch (error) {
      notify(getActionErrorMessage(error, '应用配置失败。'), 'error');
    } finally {
      setListBusy(false);
    }
  }

  async function handleRefreshNetworkStatus() {
    try {
      const nextStatus = await window.monitorApi.checkNetwork();
      setNetworkStatus(nextStatus || EMPTY_NETWORK_STATUS);
    } catch (error) {
      notify(getActionErrorMessage(error, "网络状态检测失败。"), "error");
    }
  }

  async function handleSyncToGist() {
    setListBusy(true);

    try {
      const result = await window.monitorApi.syncGist(gistSync);
      if (result?.snapshot) {
        applySnapshot(result.snapshot, {
          setApis,
          setEvents,
          setGistSync,
          setRemoteMachines,
          setRemoteMachinesSync,
          setIntervalSeconds,
          setMonitorMode,
          setNetworkCheckURL,
          setNetworkStatus,
          setIsRunning,
          setLastRunAt,
          setStatusFloat,
        }, { includeGistSync: true });
      }

      const gistMessage = result?.gistId
        ? `配置已同步到 GitHub Gist（${result.gistId}）。`
        : "配置已同步到 GitHub Gist。";
      notify(gistMessage, "info");
      setIsGistSyncOpen(false);
      setIsRemoteMachinesOpen(false);
    } catch (error) {
      notify(getActionErrorMessage(error, "同步到 GitHub Gist 失败。"), "error");
    } finally {
      setListBusy(false);
    }
  }

  async function handleSyncRemoteMachinesToGist() {
    if (typeof window.monitorApi?.syncRemoteMachinesGist !== "function") {
      notify("当前窗口还没加载新的桌面桥接，请重启应用后再试。", "error");
      return;
    }

    setListBusy(true);

    try {
      const result = await window.monitorApi.syncRemoteMachinesGist({
        settings: gistSync,
        remoteMachinesSync,
      });
      if (result?.snapshot) {
        applySnapshot(result.snapshot, {
          setApis,
          setEvents,
          setGistSync,
          setRemoteMachines,
          setRemoteMachinesSync,
          setIntervalSeconds,
          setMonitorMode,
          setNetworkCheckURL,
          setNetworkStatus,
          setIsRunning,
          setLastRunAt,
          setStatusFloat,
        }, { includeGistSync: true });
      }

      const gistMessage = result?.gistId
        ? `远程机器已同步到 GitHub Gist（${result.gistId}）。`
        : "远程机器已同步到 GitHub Gist。";
      notify(gistMessage, "info");
    } catch (error) {
      notify(getActionErrorMessage(error, "同步远程机器到 GitHub Gist 失败。"), "error");
    } finally {
      setListBusy(false);
    }
  }

  async function executeRestoreFromGist(mode) {
    setListBusy(true);

    try {
      const result = await window.monitorApi.restoreGist({
        settings: gistSync,
        mode,
      });
      if (result?.snapshot) {
        applySnapshot(result.snapshot, {
          setApis,
          setEvents,
          setGistSync,
          setRemoteMachines,
          setRemoteMachinesSync,
          setIntervalSeconds,
          setMonitorMode,
          setNetworkCheckURL,
          setNetworkStatus,
          setIsRunning,
          setLastRunAt,
          setStatusFloat,
        }, { includeGistSync: true });
      }

      const actionLabel = result?.mode === "merge" ? "合并配置" : "恢复配置";
      const gistMessage = result?.gistId
        ? `已从 GitHub Gist ${actionLabel}（${result.gistId}）。`
        : `已从 GitHub Gist ${actionLabel}。`;
      notify(gistMessage, "info");
      setIsGistSyncOpen(false);
      setRemoteMachineForm(emptyRemoteMachineForm);
    } catch (error) {
      notify(getActionErrorMessage(error, "从 GitHub Gist 恢复配置失败。"), "error");
    } finally {
      setListBusy(false);
    }
  }

  async function executeRestoreRemoteMachinesFromGist(mode) {
    if (typeof window.monitorApi?.restoreRemoteMachinesGist !== "function") {
      notify("当前窗口还没加载新的桌面桥接，请重启应用后再试。", "error");
      return;
    }

    setListBusy(true);

    try {
      const result = await window.monitorApi.restoreRemoteMachinesGist({
        settings: gistSync,
        remoteMachinesSync,
        mode,
      });
      if (result?.snapshot) {
        applySnapshot(result.snapshot, {
          setApis,
          setEvents,
          setGistSync,
          setRemoteMachines,
          setRemoteMachinesSync,
          setIntervalSeconds,
          setMonitorMode,
          setNetworkCheckURL,
          setNetworkStatus,
          setIsRunning,
          setLastRunAt,
          setStatusFloat,
        }, { includeGistSync: true });
      }

      const actionLabel = result?.mode === "merge" ? "合并远程机器配置" : "恢复远程机器配置";
      const gistMessage = result?.gistId
        ? `已从 GitHub Gist ${actionLabel}（${result.gistId}）。`
        : `已从 GitHub Gist ${actionLabel}。`;
      notify(gistMessage, "info");
      setRemoteMachineForm(emptyRemoteMachineForm);
    } catch (error) {
      notify(getActionErrorMessage(error, "从 GitHub Gist 恢复远程机器配置失败。"), "error");
    } finally {
      setListBusy(false);
    }
  }

  async function handleRestoreRemoteMachinesFromGist() {
    await executeRestoreRemoteMachinesFromGist("overwrite");
  }

  async function handleRestoreFromGist() {
    if (apis.length > 0) {
      setIsGistSyncOpen(false);
      setPendingRestoreChoice({ localCount: apis.length });
      return;
    }

    await executeRestoreFromGist("overwrite");
  }

  async function handleOpenStatusFloat(api) {
    if (!api?.id) {
      notify("未找到要展示的 API。", "error");
      return;
    }

    try {
      const snapshot = await window.monitorApi.openStatusFloat(api.id);
      if (snapshot) {
        applySnapshot(snapshot, {
          setApis,
          setEvents,
          setGistSync,
          setRemoteMachines,
          setRemoteMachinesSync,
          setIntervalSeconds,
          setMonitorMode,
          setNetworkCheckURL,
          setNetworkStatus,
          setIsRunning,
          setLastRunAt,
          setStatusFloat,
        });
      }

      notify(`${api.name} 状态浮窗已打开。`, "info");
    } catch (error) {
      notify(getActionErrorMessage(error, "打开状态浮窗失败。"), "error");
    }
  }

  async function handleCloseStatusFloat(apiId) {
    try {
      const snapshot = await window.monitorApi.closeStatusFloat(apiId);
      if (snapshot) {
        applySnapshot(snapshot, {
          setApis,
          setEvents,
          setGistSync,
          setRemoteMachines,
          setRemoteMachinesSync,
          setIntervalSeconds,
          setMonitorMode,
          setNetworkCheckURL,
          setNetworkStatus,
          setIsRunning,
          setLastRunAt,
          setStatusFloat,
        });
      }
    } catch (error) {
      notify(getActionErrorMessage(error, "关闭状态浮窗失败。"), "error");
    }
  }

  async function handleToggleStatusFloat(api, nextOpen) {
    if (nextOpen) {
      await handleOpenStatusFloat(api);
      return;
    }

    await handleCloseStatusFloat(api?.id);
  }

  function handleRestoreChoiceCancel() {
    if (listBusy) {
      return;
    }

    setPendingRestoreChoice(null);
  }

  async function handleRestoreMergeConfirm() {
    setPendingRestoreChoice(null);
    await executeRestoreFromGist("merge");
  }

  async function handleRestoreOverwriteConfirm() {
    setPendingRestoreChoice(null);
    await executeRestoreFromGist("overwrite");
  }

  return {
    events,
    flash,
    form,
    formBusy,
    focusedApis,
    gistSync,
    hasConfiguredGistSync: hasConfiguredGistSync(),
    intervalSeconds,
    isApiFormOpen,
    isGistSyncOpen,
    isRemoteMachinesOpen,
    isRunning,
    lastRunAt,
    listBusy,
    monitorMode,
    modelFilters,
    monitorBusy,
    networkCheckURL,
    networkStatus,
    now,
    pendingDeleteApi,
    pendingRestoreChoice,
    remoteMachineForm,
    remoteMachines,
    remoteMachinesSync,
    selectedModelSet,
    statusFloat,
    stats,
    unfocusedApis,
    setIntervalSeconds,
    handleCancelEdit,
    handleClearApiHistory,
    handleClearHistory,
    handleCopyAccountName,
    handleCopyAccountPassword,
    handleCopyApiKey,
    handleCopyGistId,
    handleDeleteCancel,
    handleDeleteConfirm,
    handleDeleteRemoteMachine,
    handleDeleteRequest,
    handleEdit,
    handleEditRemoteMachine,
    handleApplyApiConfig,
    handleManualCheck,
    handleMonitorModeChange,
    handleCloseGistSync,
    handleCloseRemoteMachines,
    handleOpenAddApi,
    handleOpenGistSync,
    handleOpenRemoteMachines,
    handleOpenWebsite,
    handleOpenStatusFloat,
    handleToggleStatusFloat,
    handleRefreshNetworkStatus,
    handleRestoreRemoteMachinesFromGist,
    handleRestoreChoiceCancel,
    handleRestoreFromGist,
    handleRestoreMergeConfirm,
    handleRestoreOverwriteConfirm,
    handleSingleCheck,
    handleSubmitRemoteMachine,
    handleSubmit,
    handleSyncRemoteMachinesToGist,
    handleSyncToGist,
    handleCloseStatusFloat,
    handleTogglePause,
    handleToggleModel,
    handleToggleMonitoring,
    updateForm,
    updateGistSync,
    updateRemoteMachineForm,
    updateRemoteMachinesSync,
    apis,
  };
}
