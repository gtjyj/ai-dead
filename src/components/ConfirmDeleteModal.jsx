export default function ConfirmDeleteModal({
  listBusy,
  pendingDeleteApi,
  onCancel,
  onConfirm,
}) {
  if (!pendingDeleteApi) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="confirm-modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">删除确认</p>
        <h2 id="delete-title">确认删除这个 API？</h2>
        <p className="confirm-copy">
          删除后将移除 ` {pendingDeleteApi.name} `
          的配置、测试历史和本地保存的密钥。
        </p>
        <div className="confirm-actions">
          <button
            className="ghost-button"
            type="button"
            disabled={listBusy}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={listBusy}
            onClick={onConfirm}
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}
