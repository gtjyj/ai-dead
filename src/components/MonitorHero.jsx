export default function MonitorHero({
  stats,
}) {
  return (
    <header className="hero panel">
      <div className="hero-copy-block">
        <div className="hero-status-grid">
          <p className="eyebrow">桌面巡检工具</p>
          <p className="hero-copy">
            快速巡检多个 AI 模型中转接口，持续观察可用性、延迟和近期测试结果。
          </p>
        </div>
      </div>

      <div className="hero-metrics">
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
      </div>
    </header>
  );
}
