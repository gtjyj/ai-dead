import {
  HEALTHY_AVAILABILITY_THRESHOLD,
  HIGH_LATENCY_MS,
} from "./monitorDefaults";

export function isTimeoutHistoryItem(item, timeoutSeconds) {
  if (!item || item.status !== "error") {
    return false;
  }

  if (typeof item.detail === "string" && item.detail.includes("请求超时")) {
    return true;
  }

  const timeoutMs = Number(timeoutSeconds) * 1000;
  return (
    Number.isFinite(timeoutMs) && timeoutMs > 0 && item.latencyMs >= timeoutMs
  );
}

export function getAverageLatency(history, timeoutSeconds) {
  const validItems = history.filter(
    (item) =>
      Number.isFinite(item?.latencyMs) &&
      !isTimeoutHistoryItem(item, timeoutSeconds),
  );

  if (!validItems.length) {
    return null;
  }

  const totalLatency = validItems.reduce(
    (sum, item) => sum + item.latencyMs,
    0,
  );

  return totalLatency / validItems.length;
}

export function getDotTone(item) {
  if (item?.status !== "success") {
    return "error";
  }

  return item?.latencyMs > HIGH_LATENCY_MS ? "warning" : "success";
}

export function formatDotStatus(item) {
  const tone = getDotTone(item);

  if (tone === "warning") {
    return "延迟高";
  }

  return tone === "success" ? "通" : "不通";
}

export function getDotDetail(item) {
  if (item?.detail) {
    return item.detail;
  }

  return item?.status === "success" ? "连接正常" : "暂无结果";
}

export function formatAvailability(history) {
  const total = history.length;
  if (!total) {
    return { label: "--", tone: "neutral" };
  }

  const successCount = history.filter(
    (item) => item.status === "success",
  ).length;
  const rate = (successCount / total) * 100;

  if (rate >= 80) {
    return { label: `${rate.toFixed(2)}%`, tone: "excellent" };
  }

  if (rate >= 40) {
    return { label: `${rate.toFixed(2)}%`, tone: "warning" };
  }

  return { label: `${rate.toFixed(2)}%`, tone: "danger" };
}

export function getAvailabilityRate(history) {
  if (!history.length) {
    return -1;
  }

  const successCount = history.filter(
    (item) => item.status === "success",
  ).length;
  return successCount / history.length;
}

export function isApiHealthy(api) {
  if (api?.paused) {
    return false;
  }

  const availabilityRate = getAvailabilityRate(
    (api.testHistory || []).slice(-24),
  );

  return availabilityRate >= 0
    ? availabilityRate >= HEALTHY_AVAILABILITY_THRESHOLD
    : api.status === "success";
}

export function isApiAvailable(api) {
  return !api?.paused && api?.status === "success";
}
