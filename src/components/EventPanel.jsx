import { formatDate } from "../lib/monitorFormatters";

export default function EventPanel({ events }) {
  return (
    <section className="panel event-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">日志</p>
          <h2>最近日志</h2>
        </div>
      </div>

      <div className="event-list">
        {events.length ? (
          events.map((item) => (
            <article key={item.id} className="event-item">
              <div>
                <strong>{item.apiName || "系统"}</strong>
                <p>{item.text}</p>
              </div>
              <time>{formatDate(item.at)}</time>
            </article>
          ))
        ) : (
          <div className="empty-feed">暂无日志。</div>
        )}
      </div>
    </section>
  );
}
