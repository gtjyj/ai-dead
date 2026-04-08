export default function NetworkStatusBanner({ networkCheckURL, networkStatus, onRefresh }) {
  if (networkStatus?.isOnline !== false) {
    return null;
  }

  return (
    <section className="network-banner" role="alert" aria-live="assertive">
      <div className="network-banner-copy">
        <strong>网络无法联通</strong>
        <span>{networkStatus?.lastError || `无法访问 ${networkCheckURL || "https://baidu.com"}`}</span>
      </div>
      <button className="primary-button network-banner-button" type="button" onClick={onRefresh}>
        {networkStatus?.checking ? "检测中..." : "刷新"}
      </button>
    </section>
  );
}
