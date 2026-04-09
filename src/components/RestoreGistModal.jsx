export default function RestoreGistModal({
  listBusy,
  pendingRestoreChoice,
  onCancel,
  onMerge,
  onOverwrite,
}) {
  if (!pendingRestoreChoice) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="confirm-modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">恢复方式</p>
        <h2 id="restore-title">本地已有配置，如何从 Gist 恢复？</h2>
        <p className="confirm-copy">
          当前本地共有 {pendingRestoreChoice.localCount} 个 API 配置。你可以直接用
          Gist 覆盖本地，也可以合并两边配置；合并时，若遇到相同 ID 或相同
          Base URL + 模型的配置，会以 Gist 版本为准。
        </p>
        <div className="confirm-actions confirm-actions-start">
          <button
            className="ghost-button"
            type="button"
            disabled={listBusy}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="text-button"
            type="button"
            disabled={listBusy}
            onClick={onMerge}
          >
            合并本地配置
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={listBusy}
            onClick={onOverwrite}
          >
            覆盖本地配置
          </button>
        </div>
      </div>
    </div>
  );
}
