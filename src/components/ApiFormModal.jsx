const VENDOR_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "anthropic", label: "Anthropic" },
  { value: "other", label: "其他" },
];

export default function ApiFormModal({
  form,
  formBusy,
  open,
  onCancel,
  onSubmit,
  onUpdateForm,
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
        aria-labelledby="api-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading modal-heading">
          <div>
            <p className="eyebrow">接口配置</p>
            <h2 id="api-form-title">{form.id ? "编辑 API" : "添加 API"}</h2>
          </div>
        </div>

        <form className="api-form" onSubmit={onSubmit}>
          <label>
            <span>名称</span>
            <input
              placeholder="例如：hk-relay-1"
              value={form.name}
              onChange={(event) => onUpdateForm("name", event.target.value)}
            />
          </label>

          <label>
            <span>官网地址（可选）</span>
            <input
              placeholder="https://example.com"
              value={form.websiteURL}
              onChange={(event) =>
                onUpdateForm("websiteURL", event.target.value)
              }
            />
          </label>

          <label>
            <span>账号（可选）</span>
            <input
              placeholder="email / username"
              value={form.accountName}
              onChange={(event) =>
                onUpdateForm("accountName", event.target.value)
              }
            />
          </label>

          <label>
            <span>密码（可选）</span>
            <input
              placeholder="password"
              type="password"
              value={form.accountPassword}
              onChange={(event) =>
                onUpdateForm("accountPassword", event.target.value)
              }
            />
          </label>

          <label>
            <span>接口地址</span>
            <input
              placeholder="https://relay.example.com/v1"
              value={form.baseURL}
              onChange={(event) => onUpdateForm("baseURL", event.target.value)}
            />
          </label>

          <label>
            <span>API 密钥</span>
            <input
              placeholder="sk-..."
              type="password"
              value={form.apiKey}
              onChange={(event) => onUpdateForm("apiKey", event.target.value)}
            />
          </label>

          <div className="vendor-fieldset">
            <span className="vendor-fieldset-label">模型厂商</span>
            <div
              className="vendor-radio-row"
              role="radiogroup"
              aria-label="模型厂商"
            >
              {VENDOR_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`vendor-radio-option${form.vendor === option.value ? " selected" : ""}`}
                >
                  <input
                    checked={form.vendor === option.value}
                    name="vendor"
                    type="radio"
                    value={option.value}
                    onChange={(event) =>
                      onUpdateForm("vendor", event.target.value)
                    }
                  />
                  <span className="vendor-radio-mark" aria-hidden="true" />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label>
            <span>模型</span>
            <input
              placeholder="gpt-4o-mini"
              value={form.model}
              onChange={(event) => onUpdateForm("model", event.target.value)}
            />
          </label>

          <label>
            <span>巡检间隔（秒）</span>
            <input
              min="5"
              step="1"
              type="number"
              value={form.checkIntervalSeconds}
              onChange={(event) =>
                onUpdateForm("checkIntervalSeconds", event.target.value)
              }
            />
          </label>

          <label>
            <span>超时时间（秒）</span>
            <input
              min="3"
              step="1"
              type="number"
              value={form.timeoutSeconds}
              onChange={(event) =>
                onUpdateForm("timeoutSeconds", event.target.value)
              }
            />
          </label>

          <div className="button-row modal-actions">
            <button
              className="primary-button form-submit"
              disabled={formBusy}
              type="submit"
            >
              {form.id ? "保存修改" : "添加 API"}
            </button>
            <button
              className="ghost-button form-submit"
              disabled={formBusy}
              type="button"
              onClick={onCancel}
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
