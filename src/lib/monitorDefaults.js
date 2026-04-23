export const HIGH_LATENCY_MS = 10_000;
export const DOT_SIZE = 20;
export const DOT_GAP = 8;
export const HEALTHY_AVAILABILITY_THRESHOLD = 0.8;

export const emptyForm = {
  id: "",
  name: "",
  vendor: "openai",
  baseURL: "",
  websiteURL: "",
  accountName: "",
  accountPassword: "",
  apiKey: "",
  model: "",
  checkIntervalSeconds: "60",
  timeoutSeconds: "30",
};

export const DEFAULT_MONITOR_MODE = "fixed";

export const emptyGistSync = {
  token: "",
  gistId: "",
};

export const emptyRemoteMachineForm = {
  id: "",
  name: "",
  host: "",
  username: "",
  port: "22",
  authType: "password",
  password: "",
  privateKey: "",
};

export const emptyRemoteMachinesSync = {
  gistId: "",
};
