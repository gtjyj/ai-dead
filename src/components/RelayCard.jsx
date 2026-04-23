import { useRef, useState } from "react";
import BaseSwitch from "./BaseSwitch";
import PopoverPortal from "./PopoverPortal";
import TestHistoryDots from "./TestHistoryDots";
import {
  formatLatency,
  formatLatencyCompact,
  formatRelativeTime,
} from "../lib/monitorFormatters";

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4zm4 14V12h2v7H5V4h7v2H7v11h11z" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4.2 0-7 2.1-7 4.2V21h14v-2.8c0-2.1-2.8-4.2-7-4.2z" />
    </svg>
  );
}

function PasswordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 9h-1V7a4 4 0 10-8 0v2H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-6 0V7a2 2 0 114 0v2h-4zm1 4h2v4h-2v-4z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 9h10v11H9V9zm-4-5h10v3H8v9H5V4zm3 3h8v2H9v9H8V7z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5a7 7 0 107 7h2A9 9 0 1112 3v2zm1 4v4.2l3 1.8-1 1.7-4-2.4V9h2z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20l4.2-1 9.6-9.6-3.2-3.2L5 15.8 4 20zm12-14.6l2.6 2.6 1.2-1.2a1.8 1.8 0 000-2.6l-.1-.1a1.8 1.8 0 00-2.6 0L16 5.4z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h2v9H7V9zm4 0h2v9h-2V9zm4 0h2v9h-2V9z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 12a1.75 1.75 0 1 0 0-.001A1.75 1.75 0 0 0 6.5 12zm5.5 0a1.75 1.75 0 1 0 0-.001A1.75 1.75 0 0 0 12 12zm5.5 0a1.75 1.75 0 1 0 0-.001A1.75 1.75 0 0 0 17.5 12z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h4v14H7V5zm6 0h4v14h-4V5z" />
    </svg>
  );
}

function ClearHistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h2v9H7V9zm4 0h2v9h-2V9zm4 0h2v9h-2V9z" />
    </svg>
  );
}

function ChevronRightIcon({ direction = "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={direction === "left" ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="M9 6l6 6-6 6-1.4-1.4 4.6-4.6-4.6-4.6L9 6z" />
    </svg>
  );
}

function VendorBadge({ vendor }) {
  const normalizedVendor = String(vendor || "openai").toLowerCase();
  const assetBase = import.meta.env.BASE_URL || "./";
  const vendorMap = {
    openai: { label: "OpenAI", src: `${assetBase}openai.png` },
    gemini: { label: "Gemini", src: `${assetBase}gemini.png` },
    anthropic: { label: "Anthropic", src: `${assetBase}anthropic.png` },
  };
  const current = vendorMap[normalizedVendor];

  if (!current) {
    return null;
  }

  return (
    <span className="vendor-badge" title={current.label} aria-label={`模型厂商：${current.label}`}>
      <img className="vendor-badge-image" src={current.src} alt="" aria-hidden="true" />
    </span>
  );
}

export default function RelayCard({
  api,
  availability,
  averageLatency,
  intervalSeconds,
  listBusy,
  monitorMode,
  now,
  onApplyApiConfig,
  onClearApiHistory,
  onCopyAccountName,
  onCopyAccountPassword,
  onCopyApiKey,
  onDelete,
  onEdit,
  onOpenWebsite,
  onToggleStatusFloat,
  statusFloatOpen,
  onSingleCheck,
  onTogglePause,
  remoteMachines = [],
  unfocused = false,
  visibleHistory,
}) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState("");
  const [submenuDirection, setSubmenuDirection] = useState({});
  const actionMenuRef = useRef(null);
  const actionButtonRef = useRef(null);
  const currentIntervalSeconds =
    monitorMode === "per-api"
      ? Number(api.checkIntervalSeconds) || 60
      : Number(intervalSeconds) || 60;
  const normalizedVendor = String(api?.vendor || "openai").toLowerCase();
  const canApplyToCodex = normalizedVendor === "openai";
  const cardClassName = unfocused
    ? `relay-card unfocused-card ${availability.tone}${api.paused ? " paused" : ""}`
    : `relay-card ${availability.tone}${api.paused ? " paused" : ""}`;
  const floatSwitchLabel = statusFloatOpen ? "关闭状态浮窗" : "显示状态浮窗";

  async function handleApply(target) {
    setActiveSubmenu("");
    await onApplyApiConfig(api, target);
  }

  async function handleAction(action) {
    setActionMenuOpen(false);
    setActiveSubmenu("");
    await action();
  }

  function updateSubmenuDirection(tool, event) {
    const submenuItem = event?.currentTarget;
    if (!submenuItem) {
      return;
    }

    const viewportWidth = window.innerWidth || 0;
    const itemRect = submenuItem.getBoundingClientRect();
    const estimatedSubmenuWidth = 188;
    const shouldOpenLeft = itemRect.right + estimatedSubmenuWidth > viewportWidth - 12;

    setSubmenuDirection((current) => {
      const nextDirection = shouldOpenLeft ? "left" : "right";
      if (current[tool] === nextDirection) {
        return current;
      }

      return {
        ...current,
        [tool]: nextDirection,
      };
    });
  }

  function renderApplySubmenu(tool, label) {
    const direction = submenuDirection[tool] === "left" ? "left" : "right";

    return (
      <div
        className={`relay-menu-item relay-menu-item-submenu relay-menu-item-submenu-${direction}`}
        role="none"
        onMouseEnter={(event) => {
          updateSubmenuDirection(tool, event);
          setActiveSubmenu(tool);
        }}
      >
        <button
          className="relay-menu-item-button"
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={activeSubmenu === tool}
          onFocus={(event) => {
            updateSubmenuDirection(tool, event);
            setActiveSubmenu(tool);
          }}
          onClick={(event) => event.preventDefault()}
        >
          <span>{label}</span>
          <ChevronRightIcon direction={direction} />
        </button>
        <div
          className={`relay-submenu-popover${activeSubmenu === tool ? " visible" : ""}`}
          role="menu"
        >
          <button
            className="relay-menu-item"
            type="button"
            role="menuitem"
            onClick={() => handleAction(() => handleApply({ scope: "local", tool }))}
          >
            <span>本机</span>
          </button>
          {remoteMachines.map((machine) => {
            const machineName = machine.name || machine.host || "未命名机器";

            return (
              <button
                key={`${tool}-${machine.id}`}
                className="relay-menu-item"
                type="button"
                role="menuitem"
                onClick={() =>
                  handleAction(() =>
                    handleApply({
                      machineId: machine.id,
                      scope: "remote",
                      tool,
                    }),
                  )
                }
              >
                <span>{machineName}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <article className={cardClassName}>
      <div className="relay-main-row">
        <div className="relay-identity">
            <div className="relay-header-row">
              <div className="relay-name-row">
                <VendorBadge vendor={api.vendor} />
                <h3 className={`relay-title ${availability.tone}`}>{api.name}</h3>
                {api.websiteURL ? (
                <button
                  className="inline-link-button"
                  title="打开官网地址"
                  aria-label="打开官网地址"
                  type="button"
                  onClick={(event) => onOpenWebsite(event, api)}
                >
                  <ExternalLinkIcon />
                </button>
              ) : null}
              {api.accountName ? (
                <button
                  className="inline-copy-button"
                  title="复制账号"
                  aria-label="复制账号"
                  type="button"
                  onClick={(event) => onCopyAccountName(event, api)}
                >
                  <AccountIcon />
                </button>
              ) : null}
              {api.accountPassword ? (
                <button
                  className="inline-copy-button"
                  title="复制密码"
                  aria-label="复制密码"
                  type="button"
                  onClick={(event) => onCopyAccountPassword(event, api)}
                >
                  <PasswordIcon />
                </button>
              ) : null}
              <button
                className="inline-copy-button"
                title="复制 API 密钥"
                aria-label="复制 API 密钥"
                type="button"
                onClick={(event) => onCopyApiKey(event, api)}
              >
                <CopyIcon />
              </button>
              {api.paused ? (
                <span className="status-chip neutral paused-chip">已暂停</span>
              ) : null}

              <div className="relay-baseurl-row">
                <span>{api.baseURL}</span>
              </div>
            </div>

            <div className="relay-actions relay-actions-top">
              <div className="relay-float-toggle">
                <BaseSwitch
                  checked={statusFloatOpen}
                  disabled={listBusy}
                  label={`${api.name} 状态浮窗`}
                  offText="浮窗"
                  onText="关闭"
                  title={floatSwitchLabel}
                  onChange={() => onToggleStatusFloat(api, !statusFloatOpen)}
                />
              </div>
              <button
                disabled={listBusy}
                className="icon-button success"
                title="巡检此 API"
                aria-label="巡检此 API"
                type="button"
                onClick={() => onSingleCheck(api)}
              >
                <CheckIcon />
              </button>
              <div
                className="relay-apply-menu relay-actions-menu"
                ref={actionMenuRef}
              >
                <button
                  ref={actionButtonRef}
                  disabled={listBusy}
                  className={`icon-button ${api.paused ? "pause" : ""}`}
                  title="更多操作"
                  aria-label="更多操作"
                  type="button"
                  aria-expanded={actionMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setActionMenuOpen((current) => !current);
                  }}
                >
                  <MoreIcon />
                </button>
                <PopoverPortal
                  anchorElement={actionButtonRef.current}
                  className="relay-menu-popover relay-action-popover"
                  closeOnEscape
                  closeOnOutsideClick
                  onRequestClose={() => setActionMenuOpen(false)}
                  open={actionMenuOpen}
                  placement="top-end"
                  portalClassName="relay-menu-popover-portal"
                >
                  <div
                    className="relay-menu-popover-surface"
                    role="menu"
                    onMouseLeave={() => setActiveSubmenu("")}
                  >
                        <button
                          className="relay-menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => handleAction(() => onEdit(api))}
                        >
                          <EditIcon />
                          <span>编辑 API</span>
                        </button>
                        <button
                          className="relay-menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => handleAction(() => onTogglePause(api))}
                        >
                          <PauseIcon />
                          <span>
                            {api.paused ? "恢复自动巡检" : "暂停自动巡检"}
                          </span>
                        </button>
                        <button
                          className="relay-menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => handleAction(() => onClearApiHistory(api))}
                        >
                          <ClearHistoryIcon />
                          <span>清空历史结果</span>
                        </button>
                        {canApplyToCodex ? renderApplySubmenu("codex", "应用到 Codex-Cli") : null}
                        {renderApplySubmenu("opencode", "应用到 OpenCode")}
                        <button
                          className="relay-menu-item danger"
                          type="button"
                          role="menuitem"
                          onClick={() => handleAction(() => onDelete(api))}
                        >
                          <DeleteIcon />
                          <span>删除 API</span>
                        </button>
                  </div>
                </PopoverPortal>
              </div>
            </div>
          </div>

          <div className="relay-stat-row">
            <div className="relay-stat-item">
              <dt>模型</dt>
              <dd>{api.model}</dd>
            </div>

            <div className="relay-stat-item">
              <dt>最新延迟</dt>
              <dd>{`${formatLatency(api.lastLatencyMs)} / 均${formatLatencyCompact(
                averageLatency,
              )}`}</dd>
            </div>

            <div className="relay-stat-item">
              <dt>上次测试</dt>
              <dd>{`${formatRelativeTime(api.lastCheckedAt, now)} / 间隔${currentIntervalSeconds}s`}</dd>
            </div>
          </div>
        </div>
      </div>

      <div className="relay-footer-row">
        <TestHistoryDots
          api={api}
          availability={availability}
          history={visibleHistory}
        />
      </div>
    </article>
  );
}
