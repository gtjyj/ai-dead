const https = require("https");
const http = require("http");
const { persistedState } = require("./store");
const { emitState, runtimeState } = require("./store");

const NETWORK_CHECK_INTERVAL_MS = 30_000;

let networkCheckTimer = null;
let networkCheckInFlight = null;

function updateNetworkStatus(updates) {
  runtimeState.networkStatus = {
    ...runtimeState.networkStatus,
    ...updates,
  };
  emitState();
}

function requestNetworkTarget(targetUrl) {
  return new Promise((resolve, reject) => {
    const requestUrl = String(targetUrl || persistedState.networkCheckURL || "https://baidu.com");
    const client = requestUrl.startsWith("http://") ? http : https;
    const request = client.get(requestUrl, (response) => {
      response.resume();

      if (
        response.statusCode &&
        response.statusCode >= 200 &&
        response.statusCode < 400
      ) {
        resolve({ ok: true });
        return;
      }

      reject(new Error(`HTTP ${response.statusCode || "unknown"}`));
    });

    request.setTimeout(10_000, () => {
      request.destroy(new Error("请求超时"));
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

async function checkNetworkConnectivity(force = false) {
  if (networkCheckInFlight && !force) {
    return networkCheckInFlight;
  }

  updateNetworkStatus({ checking: true });

  networkCheckInFlight = requestNetworkTarget(persistedState.networkCheckURL)
    .then(() => {
      updateNetworkStatus({
        checking: false,
        isOnline: true,
        lastError: "",
        checkedAt: new Date().toISOString(),
      });

      return runtimeState.networkStatus;
    })
    .catch((error) => {
      updateNetworkStatus({
        checking: false,
        isOnline: false,
        lastError:
          typeof error?.message === "string" ? error.message : "网络无法联通",
        checkedAt: new Date().toISOString(),
      });

      return runtimeState.networkStatus;
    })
    .finally(() => {
      networkCheckInFlight = null;
    });

  return networkCheckInFlight;
}

function startNetworkMonitoring() {
  if (networkCheckTimer) {
    return;
  }

  checkNetworkConnectivity(true).catch(() => null);
  networkCheckTimer = setInterval(() => {
    checkNetworkConnectivity().catch(() => null);
  }, NETWORK_CHECK_INTERVAL_MS);
}

function stopNetworkMonitoring() {
  if (!networkCheckTimer) {
    return;
  }

  clearInterval(networkCheckTimer);
  networkCheckTimer = null;
}

module.exports = {
  checkNetworkConnectivity,
  startNetworkMonitoring,
  stopNetworkMonitoring,
};
