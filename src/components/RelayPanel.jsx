import RelayCard from "./RelayCard";
import { getAverageLatency, formatAvailability } from "../lib/monitorMetrics";

function RelayGrid({
  apis,
  intervalSeconds,
  onApplyApiConfig,
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
  listBusy,
  monitorMode,
  modelFilters,
  now,
  onAddApi,
  onApplyApiConfig,
  onClearHistory,
  onConfigureSync,
  onCopyAccountName,
  onCopyAccountPassword,
  onCopyApiKey,
  onDeleteRequest,
  onEdit,
  onOpenWebsite,
  onToggleStatusFloat,
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
      <div className="section-heading">
        <div>
          <p className="eyebrow">接口列表</p>
          <h2>已配置接口</h2>
        </div>
      </div>

      <div className="panel-actions">
        <div className="button-row panel-actions-left">
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
        </div>
        <button
          className="text-button panel-clear-button"
          disabled={listBusy}
          type="button"
          onClick={onClearHistory}
        >
          清除历史结果
        </button>
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
