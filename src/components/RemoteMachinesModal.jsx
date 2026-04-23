import BaseSwitch from "./BaseSwitch";

function getMachineDisplayName(machine) {
  return machine.name || machine.host || "未命名机器";
}

export default function RemoteMachinesModal({
  form,
  gistSync,
  listBusy,
  machines,
  open,
  onCancel,
  onCopyGistId,
  onDelete,
  onEdit,
  onRestoreFromGist,
  onRestoreRemoteMachinesFromGist,
  onSubmit,
  onSyncRemoteMachinesToGist,
  onUpdateForm,
  onUpdateGistSync,
  onUpdateRemoteMachinesSync,
  remoteMachinesSync,
}) {
  if (!open) {
    return null;
  }

  const isKeyAuth = form.authType === "key";
  const modalTitle = form.id ? "编辑远程机器" : "新增远程机器";

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="config-modal panel remote-machines-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remote-machines-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading modal-heading">
          <div>
            <p className="eyebrow">远程机器</p>
            <h2 id="remote-machines-title">{modalTitle}</h2>
          </div>
        </div>

        <p className="config-modal-copy">
          在这里维护远程机器配置。保存后会出现在每个卡片右上角更多菜单的二级菜单里，可直接应用配置。
        </p>

        <div className="remote-machines-layout">
          <section className="remote-machines-list-block">
            <div className="subsection-heading">
              <h3>已保存机器</h3>
              <span>{machines.length ? `共 ${machines.length} 台` : "暂时还没有远程机器"}</span>
            </div>

            {machines.length ? (
              <div className="remote-machine-list-shell">
                <div className="remote-machine-list">
                  {machines.map((machine) => (
                    <div className="remote-machine-item" key={machine.id}>
                      <div className="remote-machine-item-main">
                        <strong>{getMachineDisplayName(machine)}</strong>
                        <span>{`${machine.username}@${machine.host}:${machine.port}`}</span>
                        <span>{machine.authType === "key" ? "密钥登录" : "密码登录"}</span>
                      </div>
                      <div className="button-row remote-machine-item-actions">
                        <button
                          className="ghost-button"
                          disabled={listBusy}
                          type="button"
                          onClick={() => onEdit(machine)}
                        >
                          修改
                        </button>
                        <button
                          className="text-button"
                          disabled={listBusy}
                          type="button"
                          onClick={() => onDelete(machine)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
                <div className="empty-state remote-machine-empty-state">
                  <h3>还没有远程机器</h3>
                  <p>先录入一台机器，保存后就可以在卡片菜单里直接应用配置。</p>
                </div>
            )}
          </section>

          <section className="remote-machines-form-block">
            <div className="subsection-heading">
              <h3>{form.id ? "编辑机器" : "新增机器"}</h3>
              <span>支持密码或私钥两种 SSH 认证方式</span>
            </div>

            <form className="api-form" onSubmit={onSubmit}>
              <label>
                <span>名称（可选）</span>
                <input
                  placeholder="例如：hk-prod-1"
                  value={form.name}
                  onChange={(event) => onUpdateForm("name", event.target.value)}
                />
              </label>

              <label>
                <span>Host / IP</span>
                <input
                  placeholder="192.168.1.10"
                  value={form.host}
                  onChange={(event) => onUpdateForm("host", event.target.value)}
                />
              </label>

              <div className="remote-machine-grid">
                <label>
                  <span>账号</span>
                  <input
                    placeholder="root"
                    value={form.username}
                    onChange={(event) => onUpdateForm("username", event.target.value)}
                  />
                </label>

                <label>
                  <span>SSH 端口</span>
                  <input
                    min="1"
                    max="65535"
                    step="1"
                    type="number"
                    value={form.port}
                    onChange={(event) => onUpdateForm("port", event.target.value)}
                  />
                </label>
              </div>

              <div className="vendor-fieldset remote-machine-auth-fieldset">
                <span className="vendor-fieldset-label">认证方式</span>
                <div className="remote-machine-auth-switch-row">
                  <BaseSwitch
                    checked={isKeyAuth}
                    disabled={listBusy}
                    label="切换密钥登录"
                    offText="密码"
                    onText="密钥"
                    onChange={(checked) => onUpdateForm("authType", checked ? "key" : "password")}
                  />
                  <span className="remote-machine-auth-hint">
                    {isKeyAuth ? "当前使用私钥登录" : "当前使用密码登录"}
                  </span>
                </div>
              </div>

              {isKeyAuth ? (
                <label>
                  <span>私钥内容</span>
                  <textarea
                    className="remote-machine-secret-input"
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    rows="8"
                    value={form.privateKey}
                    onChange={(event) => onUpdateForm("privateKey", event.target.value)}
                  />
                </label>
              ) : (
                <label>
                  <span>密码</span>
                  <input
                    placeholder="password"
                    type="password"
                    value={form.password}
                    onChange={(event) => onUpdateForm("password", event.target.value)}
                  />
                </label>
              )}

              <div className="button-row modal-actions modal-actions-split">
                <button className="primary-button form-submit" disabled={listBusy} type="submit">
                  {form.id ? "保存修改" : "保存机器"}
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
            </form>
          </section>
        </div>

        <section className="gist-sync-panel remote-machine-gist-panel">
          <div className="subsection-heading">
            <h3>同步到 Gist</h3>
            <span>{gistSync.token ? "已配置同步 Token" : "首次同步前请先填写 Token"}</span>
          </div>

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
              <span>远程机器 Gist ID</span>
              <div className="gist-id-input-row">
                <input
                  placeholder="首次同步后自动生成，也可手动填写"
                  value={remoteMachinesSync.gistId}
                  onChange={(event) => onUpdateRemoteMachinesSync("gistId", event.target.value)}
                />
                <button
                  className="ghost-button gist-copy-button"
                  disabled={!remoteMachinesSync.gistId || listBusy}
                  type="button"
                  onClick={(event) => onCopyGistId(event, { gistId: remoteMachinesSync.gistId })}
                >
                  复制
                </button>
              </div>
            </label>

            <div className="gist-id-note" role="status" aria-live="polite">
              <p>
                远程机器与主配置共用同一个 Token，但使用独立的 Gist ID。首次为空，成功同步后会自动回填 GitHub 生成的 ID。
              </p>
            </div>

            <div className="button-row modal-actions modal-actions-split">
              <button
                className="ghost-button form-submit"
                disabled={listBusy}
                type="button"
                onClick={onSyncRemoteMachinesToGist}
              >
                同步到 Gist
              </button>
              <button
                className="text-button form-submit"
                disabled={listBusy}
                type="button"
                onClick={onRestoreRemoteMachinesFromGist}
              >
                从 Gist 恢复
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
