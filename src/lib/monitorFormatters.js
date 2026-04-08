export function formatDate(value) {
  if (!value) {
    return "未测试";
  }

  return new Date(value).toLocaleString();
}

export function formatRelativeTime(value, now = Date.now()) {
  if (!value) {
    return "未测试";
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "未测试";
  }

  const diffSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSeconds < 60) {
    return `${diffSeconds}秒前`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }

  return `${Math.floor(diffHours / 24)}天前`;
}

export function formatLatency(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${value} ms`;
}

export function formatLatencyCompact(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${Math.round(value)}ms`;
}

export function normalizeClipboardText(value) {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, "").trim() : "";
}

export function getModelLabel(model) {
  return typeof model === "string" && model.trim() ? model.trim() : "未填写模型";
}
