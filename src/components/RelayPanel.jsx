import RelayCard from "./RelayCard";
import { getAverageLatency, formatAvailability } from "../lib/monitorMetrics";

function RelayGrid({
  apis,
  intervalSeconds,
  onApplyApiConfig,
  onClearApiHistory,
  listBusy,
  monitorMode,
  now,
  onCopyAccountName,
  onCopyAccountPassword,
  onCopyApiKey,
  onDeleteRequest,
  onEdit,
  onOpenWebsite,
  onToggleStatusFloat,
  onSingleCheck,
  onTogglePause,
  openStatusFloatApiIds,
  unfocused = false,
}) {
  return apis.map((api) => {
    const visibleHistory = (api.testHistory || []).slice(-24);
    const availability = formatAvailability(visibleHistory);
    const averageLatency = getAverageLatency(
      api.testHistory || [],
      api.timeoutSeconds || 30,
    );

    return (
      <RelayCard
        key={api.id}
        api={api}
        availability={availability}
        averageLatency={averageLatency}
        intervalSeconds={intervalSeconds}
        listBusy={listBusy}
        monitorMode={monitorMode}
        now={now}
        onApplyApiConfig={onApplyApiConfig}
        onClearApiHistory={onClearApiHistory}
        onCopyAccountName={onCopyAccountName}
        onCopyAccountPassword={onCopyAccountPassword}
        onCopyApiKey={onCopyApiKey}
        onDelete={onDeleteRequest}
        onEdit={onEdit}
        onOpenWebsite={onOpenWebsite}
        onToggleStatusFloat={onToggleStatusFloat}
        onSingleCheck={onSingleCheck}
        onTogglePause={onTogglePause}
        statusFloatOpen={openStatusFloatApiIds.includes(api.id)}
        unfocused={unfocused}
        visibleHistory={visibleHistory}
      />
    );
  });
}

export default function RelayPanel({
  apis,
  focusedApis,
  intervalSeconds,
  isRunning,
  listBusy,
  monitorMode,
  monitorBusy,
  modelFilters,
  now,
  onAddApi,
  onApplyApiConfig,
  onClearApiHistory,
  onClearHistory,
  onConfigureSync,
  onCopyAccountName,
  onCopyAccountPassword,
  onCopyApiKey,
  onCloseStatusFloat,
  onDeleteRequest,
  onEdit,
  onIntervalChange,
  onManualCheck,
  onMonitorModeChange,
  onOpenWebsite,
  onToggleStatusFloat,
  onToggleMonitoring,
  onSingleCheck,
  onTogglePause,
  onToggleModel,
  openStatusFloatApiIds,
  selectedModelSet,
  unfocusedApis,
}) {
  const activeFocusedApis = focusedApis.filter((api) => !api.paused);
  const pausedFocusedApis = focusedApis.filter((api) => api.paused);
  const activeUnfocusedApis = unfocusedApis.filter((api) => !api.paused);
  const pausedUnfocusedApis = unfocusedApis.filter((api) => api.paused);
  const pausedApis = [...pausedFocusedApis, ...pausedUnfocusedApis];

  return (
    <section className="panel relay-panel">
      <div className="relay-panel-header">
        <div className="relay-panel-header-left">
          <div className="section-heading relay-panel-heading">
            <div>
              <p className="eyebrow">接口列表</p>
              <h2>已配置接口</h2>
            </div>
          </div>

          <div className="button-row relay-panel-primary-actions">
            <button
              className="primary-button"
              disabled={listBusy}
              type="button"
              onClick={onAddApi}
            >
              添加API
            </button>
            <button
              className="ghost-button"
              disabled={listBusy}
              type="button"
              onClick={onConfigureSync}
            >
              配置同步
            </button>
            <button
              className="text-button relay-clear-button"
              disabled={listBusy}
              type="button"
              onClick={onClearHistory}
            >
              清除全部巡检结果
            </button>
            {openStatusFloatApiIds.length ? (
              <button
                className="ghost-button"
                disabled={listBusy}
                type="button"
                onClick={onCloseStatusFloat}
              >
                关闭全部浮窗
              </button>
            ) : null}
          </div>
        </div>

        <div className="relay-panel-header-right">
          <div className="relay-monitor-panel">
            <div
              className="monitor-mode-row"
              role="radiogroup"
              aria-label="自动巡检模式"
            >
              <button
                type="button"
                className={`monitor-mode-chip${monitorMode === "fixed" ? " active" : ""}`}
                aria-pressed={monitorMode === "fixed"}
                disabled={isRunning || monitorBusy}
                onClick={() => onMonitorModeChange("fixed")}
              >
                固定时间巡检
              </button>
              <button
                type="button"
                className={`monitor-mode-chip${monitorMode === "per-api" ? " active" : ""}`}
                aria-pressed={monitorMode === "per-api"}
                disabled={isRunning || monitorBusy}
                onClick={() => onMonitorModeChange("per-api")}
              >
                按接口间隔巡检
              </button>
            </div>

            <div className="panel-monitor-actions">
              {monitorMode === "fixed" ? (
                <input
                  min="5"
                  step="1"
                  type="number"
                  value={intervalSeconds}
                  onChange={(event) => onIntervalChange(event.target.value)}
                  placeholder="巡检间隔（秒）"
                />
              ) : null}
              <button
                disabled={monitorBusy}
                className={`monitor-toggle-button ${isRunning ? "active" : ""}`}
                type="button"
                onClick={onToggleMonitoring}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5h6.5A4.5 4.5 0 0119 9.5V12h-2V9.5A2.5 2.5 0 0014.5 7H8V5zm-3 7h2v2.5A4.5 4.5 0 0011.5 19H18v2h-6.5A6.5 6.5 0 015 14.5V12zm3.8-1.6L15 14l-6.2 3.6V10.4z" />
                </svg>
                {isRunning ? (
                  <span className="monitor-spinner" aria-hidden="true" />
                ) : null}
                {isRunning ? "暂停巡检" : "自动巡检"}
              </button>
              <button
                disabled={monitorBusy || isRunning}
                className="ghost-button relay-refresh-button"
                type="button"
                onClick={onManualCheck}
                aria-label="手动刷新"
                title="手动刷新"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>手动刷新</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {modelFilters.length ? (
        <section className="model-filter-panel">
          <div className="model-filter-heading">
            <span>快速模型筛选</span>
            <span>{`已关注 ${focusedApis.length} 个接口`}</span>
          </div>
          <div className="model-filter-list">
            {modelFilters.map((item) => {
              const isSelected = selectedModelSet.has(item.label);

              return (
                <button
                  key={item.label}
                  type="button"
                  className={`model-filter-chip${isSelected ? " selected" : " muted"}`}
                  onClick={() => onToggleModel(item.label)}
                >
                  <span>{item.label}</span>
                  <span>{`（可用数${item.available}个）`}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="relay-grid">
        {!apis.length ? (
          <div className="empty-state">
            <h3>还没有配置接口</h3>
            <p>先添加一个中转接口，再开始连通性巡检。</p>
          </div>
        ) : activeFocusedApis.length ? (
          <RelayGrid
            apis={activeFocusedApis}
            intervalSeconds={intervalSeconds}
            listBusy={listBusy}
            monitorMode={monitorMode}
            now={now}
            onApplyApiConfig={onApplyApiConfig}
            onClearApiHistory={onClearApiHistory}
            onCopyAccountName={onCopyAccountName}
            onCopyAccountPassword={onCopyAccountPassword}
            onCopyApiKey={onCopyApiKey}
            onDeleteRequest={onDeleteRequest}
            onEdit={onEdit}
            onOpenWebsite={onOpenWebsite}
            onToggleStatusFloat={onToggleStatusFloat}
            onSingleCheck={onSingleCheck}
            onTogglePause={onTogglePause}
            openStatusFloatApiIds={openStatusFloatApiIds}
          />
        ) : null}
      </div>

      {activeUnfocusedApis.length ? (
        <section className="unfocused-section">
          <div className="unfocused-heading">
            <span>未关注</span>
            <span>{`${activeUnfocusedApis.length} 个接口`}</span>
          </div>
          <div className="relay-grid unfocused-grid">
            <RelayGrid
              apis={activeUnfocusedApis}
              intervalSeconds={intervalSeconds}
              listBusy={listBusy}
              monitorMode={monitorMode}
              now={now}
              onApplyApiConfig={onApplyApiConfig}
              onClearApiHistory={onClearApiHistory}
              onCopyAccountName={onCopyAccountName}
              onCopyAccountPassword={onCopyAccountPassword}
              onCopyApiKey={onCopyApiKey}
              onDeleteRequest={onDeleteRequest}
              onEdit={onEdit}
              onOpenWebsite={onOpenWebsite}
              onToggleStatusFloat={onToggleStatusFloat}
              onSingleCheck={onSingleCheck}
              onTogglePause={onTogglePause}
              openStatusFloatApiIds={openStatusFloatApiIds}
              unfocused
            />
          </div>
        </section>
      ) : null}

      {pausedApis.length ? (
        <section className="unfocused-section paused-section">
          <div className="unfocused-heading">
            <span>已暂停</span>
            <span>{`${pausedApis.length} 个接口`}</span>
          </div>
          <div className="relay-grid unfocused-grid">
            <RelayGrid
              apis={pausedApis}
              intervalSeconds={intervalSeconds}
              listBusy={listBusy}
              monitorMode={monitorMode}
              now={now}
              onApplyApiConfig={onApplyApiConfig}
              onClearApiHistory={onClearApiHistory}
              onCopyAccountName={onCopyAccountName}
              onCopyAccountPassword={onCopyAccountPassword}
              onCopyApiKey={onCopyApiKey}
              onDeleteRequest={onDeleteRequest}
              onEdit={onEdit}
              onOpenWebsite={onOpenWebsite}
              onToggleStatusFloat={onToggleStatusFloat}
              onSingleCheck={onSingleCheck}
              onTogglePause={onTogglePause}
              openStatusFloatApiIds={openStatusFloatApiIds}
              unfocused
            />
          </div>
        </section>
      ) : null}
    </section>
  );
}
