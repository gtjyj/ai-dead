export default function GistSyncModal({
  gistSync,
  hasConfiguredGistSync,
  listBusy,
  open,
  onCancel,
  onCopyGistId,
  onRestoreFromGist,
  onSyncToGist,
  onUpdateGistSync,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="config-modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gist-sync-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="subsection-heading modal-heading">
          <div>
            <p className="eyebrow">同步配置</p>
            <h2 id="gist-sync-title">Gist 同步</h2>
          </div>
          <div className="gist-sync-status-row">
            <span className={`status-chip ${hasConfiguredGistSync ? "success" : "neutral"}`}>
              {hasConfiguredGistSync ? "已开启自动同步" : "未开启自动同步"}
            </span>
          </div>
        </div>

        <p className="config-modal-copy">
          同步或恢复配置到 GitHub Secret Gist，包含 API Key、账号和密码。
        </p>

        <div className="api-form gist-sync-form">
          <label>
            <span>GitHub Token</span>
            <input
              placeholder="ghp_..."
              type="password"
              value={gistSync.token}
              onChange={(event) => onUpdateGistSync("token", event.target.value)}
            />
          </label>

          <label>
            <span>Gist ID</span>
            <div className="gist-id-input-row">
              <input
                placeholder="首次同步后自动生成，也可手动填写用于恢复"
                value={gistSync.gistId}
                onChange={(event) => onUpdateGistSync("gistId", event.target.value)}
              />
              <button
                className="ghost-button gist-copy-button"
                disabled={!gistSync.gistId || listBusy}
                type="button"
                onClick={onCopyGistId}
              >
                复制
              </button>
            </div>
          </label>

          <div className="gist-id-note" role="status" aria-live="polite">
            <p>
              首次同步时会自动创建私有 Gist，并把真实 Gist ID 回填到上方输入框。
              你也可以手动填写已有的 Gist ID 来恢复配置。请妥善保存这个 ID，
              更换电脑后可配合同一个 GitHub Token 用于恢复配置。
            </p>
          </div>

          <div className="button-row modal-actions modal-actions-split">
            <button
              className="ghost-button form-submit"
              disabled={listBusy}
              type="button"
              onClick={onSyncToGist}
            >
              同步到 Gist
            </button>
            <button
              className="text-button form-submit"
              disabled={listBusy}
              type="button"
              onClick={onRestoreFromGist}
            >
              从 Gist 恢复
            </button>
            <button
              className="ghost-button form-submit"
              disabled={listBusy}
              type="button"
              onClick={onCancel}
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
