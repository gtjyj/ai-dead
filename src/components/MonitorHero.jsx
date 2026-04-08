import { formatDate } from "../lib/monitorFormatters";

export default function MonitorHero({
  intervalSeconds,
  isRunning,
  lastRunAt,
  monitorMode,
  monitorBusy,
  onMonitorModeChange,
  onIntervalChange,
  onManualCheck,
  onToggleMonitoring,
  stats,
}) {
  return (
    <header className="hero panel">
      <div className="hero-main">
        <p className="eyebrow">桌面巡检工具</p>
        <div className="hero-status-grid">
          <article className="metric-card">
            <span>总数</span>
            <strong>{stats.total}</strong>
          </article>
          <article className="metric-card success">
            <span>健康</span>
            <strong>{stats.success}</strong>
          </article>
          <article className="metric-card danger">
            <span>错误</span>
            <strong>{stats.error}</strong>
          </article>
        </div>
        <p className="hero-copy">
          快速巡检多个 AI 模型中转接口，持续观察可用性、延迟和近期测试结果。
        </p>
      </div>

      <div className="hero-side">
        <section className="hero-control-panel">
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
              固定时间时间巡检
            </button>
            <button
              type="button"
              className={`monitor-mode-chip${monitorMode === "per-api" ? " active" : ""}`}
              aria-pressed={monitorMode === "per-api"}
              disabled={isRunning || monitorBusy}
              onClick={() => onMonitorModeChange("per-api")}
            >
              按接口配置间隔巡检
            </button>
          </div>
          <div className="hero-control-row">
            {monitorMode === "fixed" && (
              <input
                min="5"
                step="1"
                type="number"
                value={intervalSeconds}
                onChange={(event) => onIntervalChange(event.target.value)}
                placeholder="巡检间隔（秒）"
              />
            )}
            <div className="hero-action-row">
              <button
                disabled={monitorBusy}
                className={`monitor-toggle-button ${isRunning ? "active" : ""}`}
                type="button"
                onClick={onToggleMonitoring}
              >
                {isRunning ? (
                  <span className="monitor-spinner" aria-hidden="true" />
                ) : null}
                {isRunning ? "暂停巡检" : "自动巡检"}
              </button>
              <button
                disabled={monitorBusy || isRunning}
                className="ghost-button icon-button"
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
              </button>
            </div>
          </div>
          <div className="hero-status-strip">
            <span>
              {isRunning ? "自动巡检运行中" : "自动巡检已暂停"}
              {monitorMode === "per-api" ? " · 按接口间隔" : " · 固定时间"}
            </span>
            <span>最近运行：{formatDate(lastRunAt)}</span>
          </div>
        </section>
      </div>
    </header>
  );
}
